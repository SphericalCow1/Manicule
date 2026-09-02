use serde::Serialize;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AppErrorCode {
    InvalidPath,
    NotFound,
    Conflict,
    AlreadyExists,
    FolderNotEmpty,
    Io,
    StateLock,
    Internal,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: AppErrorCode,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}

impl AppError {
    pub fn new(code: AppErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            detail: None,
        }
    }

    pub fn with_detail(
        code: AppErrorCode,
        message: impl Into<String>,
        detail: impl Into<String>,
    ) -> Self {
        Self {
            code,
            message: message.into(),
            detail: Some(detail.into()),
        }
    }

    pub fn invalid_path(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::InvalidPath, message)
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::NotFound, message)
    }

    pub fn conflict(message: impl Into<String>, detail: impl Into<String>) -> Self {
        Self::with_detail(AppErrorCode::Conflict, message, detail)
    }

    pub fn already_exists(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::AlreadyExists, message)
    }

    pub fn folder_not_empty(message: impl Into<String>) -> Self {
        Self::new(AppErrorCode::FolderNotEmpty, message)
    }

    pub fn io(message: impl Into<String>, detail: impl Into<String>) -> Self {
        Self::with_detail(AppErrorCode::Io, message, detail)
    }

    pub fn state_lock(detail: impl Into<String>) -> Self {
        Self::with_detail(
            AppErrorCode::StateLock,
            "mentiNote could not access its current application state. Restart the app and try again.",
            detail,
        )
    }

    pub fn internal(message: impl Into<String>, detail: impl Into<String>) -> Self {
        Self::with_detail(AppErrorCode::Internal, message, detail)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_stable_error_contract() {
        let error = AppError::io(
            "The page could not be written.",
            "permission denied for notes/Inbox.md",
        );

        assert_eq!(
            serde_json::to_value(error).unwrap(),
            serde_json::json!({
                "code": "io",
                "message": "The page could not be written.",
                "detail": "permission denied for notes/Inbox.md"
            })
        );
    }

    #[test]
    fn omits_absent_technical_detail() {
        let error = AppError::not_found("The page no longer exists.");

        assert_eq!(
            serde_json::to_value(error).unwrap(),
            serde_json::json!({
                "code": "not_found",
                "message": "The page no longer exists."
            })
        );
    }
}
