pub mod models;
pub mod pool;
pub mod seed;

#[cfg(test)]
mod tests {
    use super::models::*;

    #[test]
    fn node_default_status_is_active() {
        // Verify the DEFAULT_STATUS constant is what the migration sets.
        assert_eq!(Node::DEFAULT_STATUS, "active");
    }
}
