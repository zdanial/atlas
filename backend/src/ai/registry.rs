use super::providers::{
    AnthropicProvider, Capability, ModelProvider, OpenAIProvider, ProviderError,
};

// ---------------------------------------------------------------------------
// ProviderRegistry
// ---------------------------------------------------------------------------

pub struct ProviderRegistry {
    providers: Vec<Box<dyn ModelProvider>>,
}

impl ProviderRegistry {
    /// Build a registry, auto-detecting available providers from env vars.
    pub fn from_env() -> Self {
        let mut providers: Vec<Box<dyn ModelProvider>> = Vec::new();

        let anthropic = AnthropicProvider::new();
        if anthropic.api_key.is_some() {
            providers.push(Box::new(anthropic));
        }

        let openai = OpenAIProvider::new();
        if openai.api_key.is_some() {
            providers.push(Box::new(openai));
        }

        Self { providers }
    }

    /// Route a capability to the best available provider and call it.
    ///
    /// Routing rules:
    /// - Classification / BrainDump → prefer fast model (haiku-class) → Anthropic first
    /// - Synthesis → prefer frontier model (opus-class) → Anthropic first
    /// - EdgeInference / Embedding → prefer OpenAI, fallback to Anthropic
    pub async fn call_model(
        &self,
        capability: Capability,
        input: &str,
    ) -> Result<String, ProviderError> {
        if self.providers.is_empty() {
            return Err(ProviderError::NotConfigured(
                "no AI providers configured — set ANTHROPIC_API_KEY or OPENAI_API_KEY".into(),
            ));
        }

        // Pick preferred provider order based on capability.
        let preferred_order: Vec<&str> = match capability {
            Capability::Classification | Capability::BrainDump => {
                vec!["anthropic", "openai"]
            }
            Capability::Synthesis => {
                vec!["anthropic", "openai"]
            }
            Capability::EdgeInference | Capability::Embedding => {
                vec!["openai", "anthropic"]
            }
        };

        // Try providers in preferred order.
        for preferred in &preferred_order {
            if let Some(provider) = self.providers.iter().find(|p| p.name() == *preferred) {
                match provider.call(input).await {
                    Ok(result) => return Ok(result),
                    Err(ProviderError::NotConfigured(_)) => continue,
                    Err(e) => return Err(e),
                }
            }
        }

        // Fallback: try any available provider.
        for provider in &self.providers {
            match provider.call(input).await {
                Ok(result) => return Ok(result),
                Err(ProviderError::NotConfigured(_)) => continue,
                Err(e) => return Err(e),
            }
        }

        Err(ProviderError::NotConfigured(
            "no suitable provider found for the requested capability".into(),
        ))
    }

    /// Returns the names of all registered providers.
    pub fn available_providers(&self) -> Vec<&str> {
        self.providers.iter().map(|p| p.name()).collect()
    }
}
