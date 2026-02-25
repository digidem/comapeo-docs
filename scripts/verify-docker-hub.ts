#!/usr/bin/env bun
/**
 * Docker Hub Repository Verification Script
 *
 * This script verifies the Docker Hub repository configuration and access permissions.
 * It checks:
 * 1. Docker Hub repository exists
 * 2. Access permissions for configured credentials
 * 3. Repository visibility and settings
 */

interface DockerHubRepository {
  name: string;
  namespace: string;
  repository_type: string;
  status: number;
  summary: string;
  last_updated: string | null;
  is_private: boolean;
}

interface DockerHubErrorResponse {
  detail: string | string[];
}

/**
 * Verify Docker Hub repository exists and is accessible
 */
async function verifyRepository(repository: string): Promise<{
  exists: boolean;
  accessible: boolean;
  data?: DockerHubRepository;
  error?: string;
}> {
  const url = `https://hub.docker.com/v2/repositories/${repository}/`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (response.ok) {
      return {
        exists: true,
        accessible: true,
        data: data as DockerHubRepository,
      };
    }

    if (response.status === 404) {
      return {
        exists: false,
        accessible: false,
        error: `Repository '${repository}' does not exist on Docker Hub`,
      };
    }

    const errorData = data as DockerHubErrorResponse;
    return {
      exists: false,
      accessible: false,
      error: Array.isArray(errorData.detail)
        ? errorData.detail.join(", ")
        : errorData.detail,
    };
  } catch (error) {
    return {
      exists: false,
      accessible: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Verify Docker Hub credentials (if provided)
 */
async function verifyCredentials(
  username: string,
  password: string
): Promise<{ valid: boolean; error?: string }> {
  const authUrl =
    "https://auth.docker.io/token?service=registry.docker.io&scope=repository:library/alpine:pull";

  try {
    const response = await fetch(authUrl, {
      headers: {
        Authorization: `Basic ${btoa(`${username}:${password}`)}`,
      },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.token) {
        return { valid: true };
      }
    }

    return {
      valid: false,
      error: `Invalid credentials or insufficient permissions`,
    };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

/**
 * Main verification function
 */
async function main() {
  console.log("Docker Hub Repository Verification\n");

  // Get repository from environment or use default
  const repository =
    process.env.DOCKER_REPOSITORY ||
    process.env.DOCKER_IMAGE_NAME ||
    "digidem/comapeo-docs-api";

  console.log(`Checking repository: ${repository}\n`);

  // Verify repository exists
  const result = await verifyRepository(repository);

  if (!result.exists && result.error) {
    console.error(`❌ Repository verification failed:`);
    console.error(`   ${result.error}\n`);
    console.log(`To create this repository:`);
    console.log(`1. Go to https://hub.docker.com/`);
    console.log(
      `2. Navigate to your organization (${repository.split("/")[0]})`
    );
    console.log(`3. Click "Create Repository"`);
    console.log(`4. Name: ${repository.split("/")[1]}`);
    console.log(`5. Visibility: Public`);
    console.log(`6. Click "Create"\n`);
    process.exit(1);
  }

  if (result.exists && result.data) {
    const repo = result.data;
    console.log(`✅ Repository exists: ${repo.namespace}/${repo.name}`);
    console.log(`   Type: ${repo.repository_type}`);
    console.log(`   Visibility: ${repo.is_private ? "Private" : "Public"}`);
    console.log(`   Status: ${repo.status === 1 ? "Active" : "Inactive"}`);
    if (repo.summary) {
      console.log(`   Description: ${repo.summary}`);
    }
    if (repo.last_updated) {
      console.log(
        `   Last Updated: ${new Date(repo.last_updated).toISOString()}`
      );
    }
    console.log("");
  }

  // Verify credentials if provided
  const username = process.env.DOCKER_USERNAME;
  const password = process.env.DOCKER_PASSWORD;

  if (username && password) {
    console.log(`Verifying credentials for user: ${username}`);
    const credResult = await verifyCredentials(username, password);

    if (credResult.valid) {
      console.log(`✅ Credentials are valid\n`);
    } else {
      console.error(`❌ Credential verification failed:`);
      console.error(`   ${credResult.error}\n`);
      process.exit(1);
    }
  } else {
    console.log(
      "⚠️  No credentials provided (set DOCKER_USERNAME and DOCKER_PASSWORD to verify access)\n"
    );
  }

  // Print summary
  console.log("Summary:");
  console.log("--------");
  console.log(`Docker Hub Repository: ${repository}`);
  console.log(`GitHub Repository: digidem/comapeo-docs`);
  console.log(``);

  console.log("Required GitHub Secrets:");
  console.log("  DOCKER_USERNAME: Your Docker Hub username");
  console.log("  DOCKER_PASSWORD: Docker Hub access token (not your password)");
  console.log("");

  console.log("To create Docker Hub access token:");
  console.log("  1. Go to https://hub.docker.com/");
  console.log("  2. Click your avatar → Account Settings → Security");
  console.log("  3. Click 'New Access Token'");
  console.log("  4. Description: 'GitHub Actions - comapeo-docs-api'");
  console.log("  5. Access permissions: Read, Write, Delete");
  console.log("  6. Copy the token and add as DOCKER_PASSWORD secret");
  console.log("");
}

// Run main function
main().catch((error) => {
  console.error("Unexpected error:", error);
  process.exit(1);
});
