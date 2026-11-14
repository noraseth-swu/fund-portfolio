use axum::{
    extract::FromRequestParts,
    http::{StatusCode, request::Parts},
};
use base64::prelude::*;
use serde::Deserialize;

#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: String,
}

#[derive(Debug, Deserialize)]
struct JwtPayload {
    sub: Option<String>,
}

impl<S> FromRequestParts<S> for AuthUser
where
    S: Send + Sync,
{
    type Rejection = (StatusCode, String);

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        // ดึง Authorization: Bearer <token> จาก Request Header
        if let Some(auth_header) = parts.headers.get("authorization")
            && let Ok(auth_str) = auth_header.to_str()
            && let Some(token) = auth_str.strip_prefix("Bearer ")
        {
            let segments: Vec<&str> = token.trim().split('.').collect();
            if segments.len() >= 2 {
                let decoded = BASE64_URL_SAFE_NO_PAD
                    .decode(segments[1])
                    .or_else(|_| BASE64_STANDARD.decode(segments[1]))
                    .or_else(|_| BASE64_STANDARD_NO_PAD.decode(segments[1]));

                if let Ok(bytes) = decoded
                    && let Ok(payload) = serde_json::from_slice::<JwtPayload>(&bytes)
                    && let Some(sub) = payload.sub
                {
                    return Ok(AuthUser { user_id: sub });
                }
            }
        }

        // สำหรับ Local Dev / Default User
        Ok(AuthUser {
            user_id: "default_user".to_string(),
        })
    }
}
