#!/usr/bin/env python3
"""
Configuration presets for ASR spike tuning.
"""

# Matcher sensitivity profiles
MATCHER_PROFILES = {
    "aggressive": {
        "min_words_needed": 1,  # Advance on first word of next line
        "fuzzy_match_threshold": 0.65,  # Very forgiving
        "description": "Fast advancement, tolerates many misheard words",
    },
    "balanced": {
        "min_words_needed": 2,  # Default
        "fuzzy_match_threshold": 0.75,
        "description": "Good balance of speed and accuracy",
    },
    "conservative": {
        "min_words_needed": 2,
        "fuzzy_match_threshold": 0.85,  # Strict matching
        "description": "Fewer false positives, slightly slower advancement",
    },
}

# Streaming profiles
STREAMING_PROFILES = {
    "low_latency": {
        "chunk_duration": 0.5,
        "description": "Fast updates (~500ms latency), more noisy",
    },
    "balanced": {
        "chunk_duration": 2.0,
        "description": "Default: ~2s latency, good context",
    },
    "high_accuracy": {
        "chunk_duration": 5.0,
        "description": "More context, ~5s latency, fewer false positives",
    },
}

# Model profiles
MODEL_PROFILES = {
    "fast": {
        "model_size": "tiny",
        "description": "Fastest (~1min/3-min song), ~65% accurate",
    },
    "balanced": {
        "model_size": "base",
        "description": "Good balance (~3min for 3-min song), ~75% accurate",
    },
    "accurate": {
        "model_size": "small",
        "description": "Higher accuracy (~6min), ~80% accurate",
    },
    "best": {
        "model_size": "medium",
        "description": "Best accuracy (~15min on CPU), ~85% accurate",
    },
}
