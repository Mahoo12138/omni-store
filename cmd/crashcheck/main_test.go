package main

import (
	"slices"
	"strings"
	"testing"
)

func TestFixtureEnvironmentCannotInheritDeploymentOverrides(t *testing.T) {
	input := []string{
		"PATH=/usr/bin", "HOME=/fixture-home", "OMNISTORE_DATA_DIR=/production/data",
		"OMNISTORE_DATABASE_PATH=/production/database", "OMNISTORE_CONFIG_FILE=/production/config.yaml",
		"OMNISTORE_HTTP_ADDR=0.0.0.0:8080", "OMNISTORE_MASTER_KEY=deployment-secret",
		"OMNISTORE_FUTURE_CONFIG_OVERRIDE=/production/future",
	}
	actual := fixtureEnvironment(input)
	for _, entry := range actual {
		if strings.HasPrefix(entry, "OMNISTORE_") && entry != "OMNISTORE_MASTER_KEY=01234567890123456789012345678901" {
			t.Fatalf("deployment override reached crash fixture: %s", entry)
		}
	}
	for _, required := range []string{"PATH=/usr/bin", "HOME=/fixture-home", "OMNISTORE_MASTER_KEY=01234567890123456789012345678901"} {
		if !slices.Contains(actual, required) {
			t.Fatalf("missing required child environment: %s", required)
		}
	}
	if input[2] != "OMNISTORE_DATA_DIR=/production/data" {
		t.Fatal("filter changed its caller's environment slice")
	}
}
