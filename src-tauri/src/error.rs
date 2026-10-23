use serde::Serialize;
use std::fmt;

/// Unified error type surfaced to the frontend as a plain, human-readable string.
#[derive(Debug)]
pub struct AtlasError(String);

impl AtlasError {
    pub fn new(message: impl Into<String>) -> Self {
        Self(message.into())
    }

    pub fn context(message: &'static str, error: impl fmt::Display) -> Self {
        Self(format!("{message}: {error}"))
    }
}

impl fmt::Display for AtlasError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

impl std::error::Error for AtlasError {}

impl Serialize for AtlasError {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        serializer.serialize_str(&self.0)
    }
}

pub type AtlasResult<T> = Result<T, AtlasError>;
