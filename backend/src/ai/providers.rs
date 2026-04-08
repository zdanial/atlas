use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Capability — what the caller needs the model to do
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Capability {
    Classification,
    EdgeInference,
    Embedding,
    Synthesis,
    BrainDump,
}

// ---------------------------------------------------------------------------
// ModelProvider trait
// ---------------------------------------------------------------------------

#[async_trait::async_trait]
pub trait ModelProvider: Send + Sync {
    /// Human-readable provider name (e.g. "anthropic", "openai").
    fn name(&self) -> &str;

    /// Send a prompt to the model and return the text response.
    async fn call(&self, prompt: &str) -> Result<String, ProviderError>;
}

#[derive(Debug)]
pub enum ProviderError {
    NotConfigured(String),
    RequestFailed(String),
}

impl std::fmt::Display for ProviderError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            ProviderError::NotConfigured(msg) => write!(f, "provider not configured: {msg}"),
            ProviderError::RequestFailed(msg) => write!(f, "request failed: {msg}"),
        }
    }
}

impl std::error::Error for ProviderError {}

// ---------------------------------------------------------------------------
// AnthropicProvider (stub)
// ---------------------------------------------------------------------------

pub struct AnthropicProvider {
    pub api_key: Option<String>,
}

impl Default for AnthropicProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl AnthropicProvider {
    pub fn new() -> Self {
        let api_key = std::env::var("ANTHROPIC_API_KEY").ok();
        Self { api_key }
    }
}

#[async_trait::async_trait]
impl ModelProvider for AnthropicProvider {
    fn name(&self) -> &str {
        "anthropic"
    }

    async fn call(&self, _prompt: &str) -> Result<String, ProviderError> {
        if self.api_key.is_none() {
            return Err(ProviderError::NotConfigured(
                "ANTHROPIC_API_KEY not set — Anthropic provider is not available".into(),
            ));
        }
        // Stub: real implementation would use reqwest to call the Anthropic API.
        Err(ProviderError::RequestFailed(
            "Anthropic provider is stubbed — HTTP calls not yet implemented".into(),
        ))
    }
}

// ---------------------------------------------------------------------------
// OpenAIProvider (stub)
// ---------------------------------------------------------------------------

pub struct OpenAIProvider {
    pub api_key: Option<String>,
}

impl Default for OpenAIProvider {
    fn default() -> Self {
        Self::new()
    }
}

impl OpenAIProvider {
    pub fn new() -> Self {
        let api_key = std::env::var("OPENAI_API_KEY").ok();
        Self { api_key }
    }
}

#[async_trait::async_trait]
impl ModelProvider for OpenAIProvider {
    fn name(&self) -> &str {
        "openai"
    }

    async fn call(&self, _prompt: &str) -> Result<String, ProviderError> {
        if self.api_key.is_none() {
            return Err(ProviderError::NotConfigured(
                "OPENAI_API_KEY not set — OpenAI provider is not available".into(),
            ));
        }
        // Stub: real implementation would use reqwest to call the OpenAI API.
        Err(ProviderError::RequestFailed(
            "OpenAI provider is stubbed — HTTP calls not yet implemented".into(),
        ))
    }
}
