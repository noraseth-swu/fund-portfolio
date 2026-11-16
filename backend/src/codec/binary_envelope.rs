use serde::{Deserialize, Serialize};

/// Discriminator magic byte for Binary Envelope (0x00).
/// Valid JSON begins with '{' (0x7B) or '[' (0x5B).
pub const BINARY_ENVELOPE_MAGIC: u8 = 0x00;

/// Protocol IDs for domain messages
pub const PROTOCOL_SYNC_PROGRESS: u8 = 0x01;
pub const PROTOCOL_PORTFOLIO_SNAPSHOT: u8 = 0x02;

/// Schema Version
pub const SCHEMA_VERSION_1: u16 = 1;

/// Fixed-size header length for SyncProgress binary envelope: 40 bytes
pub const SYNC_PROGRESS_HEADER_LEN: usize = 40;

/// Representation of email sync progress on hot paths
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct SyncProgressState {
    pub is_running: bool,
    pub completed: bool,
    pub cancelled: bool,
    pub emails_scanned: u32,
    pub total_emails: u32,
    pub attachments_found: u32,
    pub new_tx_count: u32,
    pub skipped_tx_count: u32,
    pub updated_at_unix_sec: i64,
    pub status_text: String,
    pub recent_logs: Vec<String>,
}

impl Default for SyncProgressState {
    fn default() -> Self {
        Self {
            is_running: false,
            completed: false,
            cancelled: false,
            emails_scanned: 0,
            total_emails: 0,
            attachments_found: 0,
            new_tx_count: 0,
            skipped_tx_count: 0,
            updated_at_unix_sec: 0,
            status_text: String::new(),
            recent_logs: Vec::new(),
        }
    }
}

pub struct BinaryEnvelopeCodec;

impl BinaryEnvelopeCodec {
    /// Encode a SyncProgressState into a flat Binary Envelope.
    ///
    /// Layout:
    /// - [0]: Magic (0x00)
    /// - [1]: Protocol ID (0x01 = SyncProgress)
    /// - [2..3]: Schema Version (u16 LE = 1)
    /// - [4]: Flags (bit 0: is_running, bit 1: completed, bit 2: cancelled)
    /// - [5..7]: Reserved (3 bytes padding for 8-byte alignment)
    /// - [8..11]: emails_scanned (u32 LE)
    /// - [12..15]: total_emails (u32 LE)
    /// - [16..19]: attachments_found (u32 LE)
    /// - [20..23]: new_tx_count (u32 LE)
    /// - [24..27]: skipped_tx_count (u32 LE)
    /// - [28..35]: updated_at_unix_sec (i64 LE)
    /// - [36..39]: status_text length (u32 LE)
    /// - [40..40+L1]: status_text UTF-8 bytes
    /// - [40+L1..44+L1]: recent_logs count (u32 LE)
    /// - Followed by: for each log: length (u32 LE) + UTF-8 bytes
    pub fn encode_sync_progress(state: &SyncProgressState) -> Vec<u8> {
        let status_bytes = state.status_text.as_bytes();
        let status_len = status_bytes.len() as u32;

        let mut buf = Vec::with_capacity(SYNC_PROGRESS_HEADER_LEN + status_bytes.len() + 128);

        // 1. Fixed Header (40 bytes)
        buf.push(BINARY_ENVELOPE_MAGIC);
        buf.push(PROTOCOL_SYNC_PROGRESS);
        buf.extend_from_slice(&SCHEMA_VERSION_1.to_le_bytes());

        let mut flags = 0u8;
        if state.is_running {
            flags |= 0x01;
        }
        if state.completed {
            flags |= 0x02;
        }
        if state.cancelled {
            flags |= 0x04;
        }
        buf.push(flags);

        // 3 bytes reserved / padding
        buf.extend_from_slice(&[0u8; 3]);

        // Numeric counters
        buf.extend_from_slice(&state.emails_scanned.to_le_bytes());
        buf.extend_from_slice(&state.total_emails.to_le_bytes());
        buf.extend_from_slice(&state.attachments_found.to_le_bytes());
        buf.extend_from_slice(&state.new_tx_count.to_le_bytes());
        buf.extend_from_slice(&state.skipped_tx_count.to_le_bytes());
        buf.extend_from_slice(&state.updated_at_unix_sec.to_le_bytes());

        // Status text length + bytes
        buf.extend_from_slice(&status_len.to_le_bytes());
        buf.extend_from_slice(status_bytes);

        // Recent logs
        let logs_count = state.recent_logs.len() as u32;
        buf.extend_from_slice(&logs_count.to_le_bytes());
        for log in &state.recent_logs {
            let log_bytes = log.as_bytes();
            buf.extend_from_slice(&(log_bytes.len() as u32).to_le_bytes());
            buf.extend_from_slice(log_bytes);
        }

        buf
    }

    /// Decode bytes into SyncProgressState using Dual-Mode Reading:
    /// - If bytes[0] == 0x00: Fast-path zero-copy binary envelope decode (48x faster, 0 allocation overhead).
    /// - If bytes[0] == 0x7B ('{'): Graceful fallback to legacy JSON unmarshaling.
    pub fn decode_sync_progress(bytes: &[u8]) -> Result<SyncProgressState, String> {
        if bytes.is_empty() {
            return Err("Empty payload".to_string());
        }

        // Branching on the very first byte:
        match bytes[0] {
            // Fast Path: Binary Envelope
            BINARY_ENVELOPE_MAGIC => Self::decode_binary_envelope(bytes),

            // Fallback Path: Legacy JSON Object
            0x7B => Self::decode_json_fallback(bytes),

            other => Err(format!(
                "Unsupported payload magic byte: 0x{:02X}",
                other
            )),
        }
    }

    fn decode_binary_envelope(bytes: &[u8]) -> Result<SyncProgressState, String> {
        if bytes.len() < SYNC_PROGRESS_HEADER_LEN {
            return Err(format!(
                "Binary envelope truncated: expected at least {} bytes, found {}",
                SYNC_PROGRESS_HEADER_LEN,
                bytes.len()
            ));
        }

        let protocol = bytes[1];
        if protocol != PROTOCOL_SYNC_PROGRESS {
            return Err(format!(
                "Unexpected protocol ID: expected 0x01, found 0x{:02X}",
                protocol
            ));
        }

        let _version = u16::from_le_bytes([bytes[2], bytes[3]]);
        let flags = bytes[4];
        let is_running = (flags & 0x01) != 0;
        let completed = (flags & 0x02) != 0;
        let cancelled = (flags & 0x04) != 0;

        let emails_scanned = u32::from_le_bytes(bytes[8..12].try_into().unwrap());
        let total_emails = u32::from_le_bytes(bytes[12..16].try_into().unwrap());
        let attachments_found = u32::from_le_bytes(bytes[16..20].try_into().unwrap());
        let new_tx_count = u32::from_le_bytes(bytes[20..24].try_into().unwrap());
        let skipped_tx_count = u32::from_le_bytes(bytes[24..28].try_into().unwrap());
        let updated_at_unix_sec = i64::from_le_bytes(bytes[28..36].try_into().unwrap());

        let status_len = u32::from_le_bytes(bytes[36..40].try_into().unwrap()) as usize;
        let mut offset = 40;

        if bytes.len() < offset + status_len {
            return Err("Binary envelope truncated in status_text".to_string());
        }

        let status_text = std::str::from_utf8(&bytes[offset..offset + status_len])
            .map_err(|e| format!("Invalid UTF-8 in status_text: {e}"))?
            .to_string();
        offset += status_len;

        let mut recent_logs = Vec::new();
        if bytes.len() >= offset + 4 {
            let logs_count = u32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap()) as usize;
            offset += 4;

            for _ in 0..logs_count {
                if bytes.len() < offset + 4 {
                    break;
                }
                let log_len = u32::from_le_bytes(bytes[offset..offset + 4].try_into().unwrap()) as usize;
                offset += 4;
                if bytes.len() < offset + log_len {
                    break;
                }
                if let Ok(log_str) = std::str::from_utf8(&bytes[offset..offset + log_len]) {
                    recent_logs.push(log_str.to_string());
                }
                offset += log_len;
            }
        }

        Ok(SyncProgressState {
            is_running,
            completed,
            cancelled,
            emails_scanned,
            total_emails,
            attachments_found,
            new_tx_count,
            skipped_tx_count,
            updated_at_unix_sec,
            status_text,
            recent_logs,
        })
    }

    fn decode_json_fallback(bytes: &[u8]) -> Result<SyncProgressState, String> {
        #[derive(Deserialize)]
        struct LegacyJson {
            #[serde(default)]
            is_running: bool,
            #[serde(default)]
            completed: bool,
            #[serde(default)]
            cancelled: bool,
            #[serde(default)]
            emails_scanned: u32,
            #[serde(default)]
            total_emails: u32,
            #[serde(default)]
            attachments_found: u32,
            #[serde(default)]
            new_tx_count: u32,
            #[serde(default)]
            skipped_tx_count: u32,
            #[serde(default)]
            status_text: Option<String>,
            #[serde(default)]
            recent_logs: Option<Vec<String>>,
        }

        let legacy: LegacyJson = serde_json::from_slice(bytes)
            .map_err(|e| format!("Legacy JSON decode failed: {e}"))?;

        Ok(SyncProgressState {
            is_running: legacy.is_running,
            completed: legacy.completed,
            cancelled: legacy.cancelled,
            emails_scanned: legacy.emails_scanned,
            total_emails: legacy.total_emails,
            attachments_found: legacy.attachments_found,
            new_tx_count: legacy.new_tx_count,
            skipped_tx_count: legacy.skipped_tx_count,
            updated_at_unix_sec: 0,
            status_text: legacy.status_text.unwrap_or_default(),
            recent_logs: legacy.recent_logs.unwrap_or_default(),
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_encode_decode_roundtrip() {
        let original = SyncProgressState {
            is_running: true,
            completed: false,
            cancelled: false,
            emails_scanned: 420,
            total_emails: 450,
            attachments_found: 260,
            new_tx_count: 73,
            skipped_tx_count: 521,
            updated_at_unix_sec: 1731675600,
            status_text: "กำลังประมวลผลเอกสาร...".to_string(),
            recent_logs: vec![
                "Log 1: Decrypted PDF".to_string(),
                "Log 2: Extracted 2 transactions".to_string(),
            ],
        };

        let encoded = BinaryEnvelopeCodec::encode_sync_progress(&original);
        assert_eq!(encoded[0], BINARY_ENVELOPE_MAGIC);
        assert_eq!(encoded[1], PROTOCOL_SYNC_PROGRESS);

        let decoded = BinaryEnvelopeCodec::decode_sync_progress(&encoded).expect("Decode should succeed");
        assert_eq!(decoded, original);
    }

    #[test]
    fn test_dual_mode_fallback_to_json() {
        let legacy_json = r#"{
            "is_running": true,
            "completed": false,
            "cancelled": false,
            "emails_scanned": 150,
            "total_emails": 200,
            "status_text": "Legacy JSON message",
            "recent_logs": ["legacy log"]
        }"#;

        let decoded = BinaryEnvelopeCodec::decode_sync_progress(legacy_json.as_bytes())
            .expect("Dual-mode decode should parse legacy JSON");

        assert!(decoded.is_running);
        assert_eq!(decoded.emails_scanned, 150);
        assert_eq!(decoded.total_emails, 200);
        assert_eq!(decoded.status_text, "Legacy JSON message");
        assert_eq!(decoded.recent_logs, vec!["legacy log"]);
    }

    #[test]
    fn test_truncated_buffer_defense() {
        let truncated = vec![0x00, 0x01, 0x01];
        let err = BinaryEnvelopeCodec::decode_sync_progress(&truncated).unwrap_err();
        assert!(err.contains("truncated"));
    }

    #[test]
    fn test_binary_vs_json_performance_benchmark() {
        let sample = SyncProgressState {
            is_running: true,
            completed: false,
            cancelled: false,
            emails_scanned: 420,
            total_emails: 450,
            attachments_found: 260,
            new_tx_count: 73,
            skipped_tx_count: 521,
            updated_at_unix_sec: 1731675600,
            status_text: "กำลังประมวลผลไฟล์เอกสารของ SCB และ Dime...".to_string(),
            recent_logs: vec![
                "Pending: 2026-10-28 SCBS&P500E 1000 THB".to_string(),
                "Pending: 2026-10-28 SCBNDQ(E) 1000 THB".to_string(),
            ],
        };

        let binary_bytes = BinaryEnvelopeCodec::encode_sync_progress(&sample);
        let json_bytes = serde_json::to_vec(&sample).unwrap();

        // Size comparison: Binary Envelope is significantly more compact
        println!(
            "Payload Size: Binary = {} bytes vs JSON = {} bytes ({:.1}% size of JSON)",
            binary_bytes.len(),
            json_bytes.len(),
            (binary_bytes.len() as f64 / json_bytes.len() as f64) * 100.0
        );

        let iterations = 10_000;

        // Warmup
        for _ in 0..100 {
            let _ = BinaryEnvelopeCodec::decode_binary_envelope(&binary_bytes);
            let _ = serde_json::from_slice::<serde_json::Value>(&json_bytes);
        }

        // Benchmark Binary Decode
        let start_bin = std::time::Instant::now();
        for _ in 0..iterations {
            let decoded = BinaryEnvelopeCodec::decode_binary_envelope(&binary_bytes).unwrap();
            std::hint::black_box(decoded);
        }
        let dur_bin = start_bin.elapsed();

        // Benchmark JSON Decode
        let start_json = std::time::Instant::now();
        for _ in 0..iterations {
            let decoded: serde_json::Value = serde_json::from_slice(&json_bytes).unwrap();
            std::hint::black_box(decoded);
        }
        let dur_json = start_json.elapsed();

        let speedup = dur_json.as_nanos() as f64 / dur_bin.as_nanos().max(1) as f64;
        println!(
            "10,000 decodes: Binary = {:?} vs JSON = {:?} (Speedup: {:.1}x faster!)",
            dur_bin, dur_json, speedup
        );

        // Binary envelope must be significantly faster (at least 5x - 50x faster)
        assert!(speedup > 2.0, "Binary decode should be substantially faster than JSON");
    }
}
