import * as vscode from "vscode";
import {
  ConfigManager,
  ProjectConfig,
  ConnectionProfile,
} from "./configManager";

/**
 * Project Setup Wizard
 *
 * WHY WIZARD APPROACH:
 * 1. Step-by-step guidance reduces cognitive load
 * 2. Validates each step before proceeding
 * 3. Provides context and explanations at each step
 * 4. Can auto-detect and suggest smart defaults
 *
 * ALTERNATIVES CONSIDERED:
 * - Single dialog with all options
 *   ❌ Problem: Overwhelming for new users
 *   ❌ Problem: Hard to provide context for each option
 * - Configuration file editing
 *   ❌ Problem: Requires users to know exact syntax
 *   ❌ Problem: No validation or guidance
 * - Command-line interface
 *   ❌ Problem: Doesn't integrate with VS Code workflow
 */

export class ProjectSetupWizard {
  constructor(private configManager: ConfigManager) {}

  /**
   * Main setup wizard entry point
   *
   * WHY ASYNC WIZARD:
   * - Need to call MCP server to get available profiles
   * - Need to test connections during setup
   * - Need to validate each step before proceeding
   *
   * ALTERNATIVE: Synchronous wizard with predefined options
   * ❌ Problem: Can't validate real connections
   * ❌ Problem: Can't show available profiles dynamically
   */
  async startSetupWizard(): Promise<void> {
    try {
      // Show welcome message
      const startSetup = await vscode.window.showInformationMessage(
        "🚀 Welcome to DevOmni Project Setup!\n\nThis wizard will help you configure database connections and code generation settings for this project.",
        { modal: false },
        "Start Setup",
        "Cancel"
      );

      if (startSetup !== "Start Setup") {
        return;
      }

      // Step 1: Detect current project type and suggest defaults
      vscode.window.showInformationMessage("🔍 Analyzing project structure...");
      const suggestions = this.configManager.detectProjectType();

      // Step 2: Choose database type
      const database = await this.chooseDatabaseType(suggestions.database);
      if (!database) return;

      // Step 3: Choose connection profile
      const connectionProfile = await this.chooseConnectionProfile(database);
      if (!connectionProfile) return;

      // Step 4: Choose target framework
      const targetFramework = await this.chooseTargetFramework(
        suggestions.targetFramework
      );
      if (!targetFramework) return;

      // Step 5: Choose output directory
      const outputDirectory = await this.chooseOutputDirectory(
        suggestions.outputDirectory
      );
      if (!outputDirectory) return;

      // Step 6: Test connection
      const config: ProjectConfig = {
        database,
        connectionProfile,
        targetFramework,
        outputDirectory,
        mcpServerUrl: this.configManager.getCurrentConfig().mcpServerUrl,
      };

      const testPassed = await this.testAndSaveConfiguration(config);
      if (testPassed) {
        await this.showSetupComplete(config);
      }
    } catch (error) {
      vscode.window.showErrorMessage(
        `Setup failed: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Database Type Selection
   *
   * WHY QUICK PICK WITH DESCRIPTIONS:
   * - Users need to understand what each database type means
   * - Icons make it visually appealing and easier to scan
   * - Descriptions help users who might not be familiar with all types
   *
   * ALTERNATIVE: Simple string array selection
   * ❌ Problem: No context about what each option means
   * ❌ Problem: Not visually appealing or professional
   */
  private async chooseDatabaseType(
    suggested?: "postgres" | "mysql" | "mongo"
  ): Promise<"postgres" | "mysql" | "mongo" | undefined> {
    const items = [
      {
        label: "$(database) PostgreSQL",
        description: "Relational database with advanced features",
        detail:
          "Great for complex queries, transactions, and enterprise applications",
        value: "postgres" as const,
      },
      {
        label: "$(database) MySQL",
        description: "Popular relational database",
        detail: "Fast, reliable, and widely supported",
        value: "mysql" as const,
      },
      {
        label: "$(json) MongoDB",
        description: "NoSQL document database",
        detail: "Flexible schema, great for JSON-like data structures",
        value: "mongo" as const,
      },
    ];

    // Move suggested item to top
    if (suggested) {
      const suggestedIndex = items.findIndex(
        (item) => item.value === suggested
      );
      if (suggestedIndex > 0) {
        const [suggestedItem] = items.splice(suggestedIndex, 1);
        suggestedItem.label += " $(star-full) Suggested";
        items.unshift(suggestedItem);
      }
    }

    const selection = await vscode.window.showQuickPick(items, {
      placeHolder: "Select your database type",
      ignoreFocusOut: true,
      title: "DevOmni Setup: Database Type",
    });

    return selection?.value;
  }

  /**
   * Connection Profile Selection
   *
   * WHY FETCH PROFILES DYNAMICALLY:
   * - Shows only available profiles from MCP server
   * - Validates that profiles actually exist
   * - Provides real connection details in descriptions
   * - Automatically stays in sync with .env changes
   *
   * ALTERNATIVE: Hardcoded profile list
   * ❌ Problem: Gets out of sync with actual connections
   * ❌ Problem: Users see profiles that don't exist
   * ❌ Problem: No validation of connection availability
   */
  private async chooseConnectionProfile(
    database: "postgres" | "mysql" | "mongo"
  ): Promise<string | undefined> {
    vscode.window.showInformationMessage(
      "📡 Fetching available connection profiles..."
    );

    try {
      const profiles = await this.configManager.getAvailableProfiles();
      const relevantProfiles = profiles.filter((p) => p.database === database);

      if (relevantProfiles.length === 0) {
        const setup = await vscode.window.showWarningMessage(
          `No ${database} connection profiles found in DevOmni MCP server.\n\nYou need to configure database connections in your DevOmni project's .env file first.`,
          "Open DevOmni Setup Guide",
          "Continue with Default"
        );

        if (setup === "Open DevOmni Setup Guide") {
          vscode.env.openExternal(
            vscode.Uri.parse("https://github.com/your-repo/devomni-lite#setup")
          );
          return undefined;
        }

        return "default";
      }

      const items = relevantProfiles.map((profile) => ({
        label: `$(plug) ${profile.displayName}`,
        description: profile.description || `${profile.database} connection`,
        detail: `Profile: ${profile.name}`,
        value: profile.name,
      }));

      const selection = await vscode.window.showQuickPick(items, {
        placeHolder: `Select your ${database} connection profile`,
        ignoreFocusOut: true,
        title: "DevOmni Setup: Connection Profile",
      });

      return selection?.value;
    } catch (error) {
      const proceed = await vscode.window.showWarningMessage(
        `Could not fetch connection profiles: ${
          error instanceof Error ? error.message : "Unknown error"
        }\n\nProceed with default profile?`,
        "Use Default",
        "Cancel"
      );

      return proceed === "Use Default" ? "default" : undefined;
    }
  }

  /**
   * Target Framework Selection
   *
   * WHY FRAMEWORK-SPECIFIC OPTIONS:
   * - Each framework has different conventions and patterns
   * - Generated code needs to match framework expectations
   * - Different frameworks have different capabilities
   * - Users expect framework-appropriate code structure
   *
   * ALTERNATIVE: Generic code generation only
   * ❌ Problem: Generated code doesn't follow framework conventions
   * ❌ Problem: Users have to manually adapt generic code
   * ❌ Problem: Can't leverage framework-specific features
   */
  private async chooseTargetFramework(
    suggested?: string
  ): Promise<ProjectConfig["targetFramework"] | undefined> {
    const items = [
      {
        label: "$(react) Next.js",
        description: "React framework with API routes",
        detail: "Generates App Router API routes with TypeScript",
        value: "nextjs" as const,
      },
      {
        label: "$(server-process) Express.js",
        description: "Fast, unopinionated web framework for Node.js",
        detail: "Generates RESTful route handlers with middleware",
        value: "express" as const,
      },
      {
        label: "$(nest) NestJS",
        description: "Progressive Node.js framework",
        detail: "Generates controllers with decorators and DTOs",
        value: "nestjs" as const,
      },
      {
        label: "$(python) FastAPI",
        description: "Modern Python web framework",
        detail: "Generates async endpoints with automatic OpenAPI docs",
        value: "fastapi" as const,
      },
      {
        label: "$(code) Generic",
        description: "Framework-agnostic code",
        detail: "Basic API structure that works with any framework",
        value: "generic" as const,
      },
    ];

    // Move suggested item to top
    if (suggested) {
      const suggestedIndex = items.findIndex(
        (item) => item.value === suggested
      );
      if (suggestedIndex > 0) {
        const [suggestedItem] = items.splice(suggestedIndex, 1);
        suggestedItem.label += " $(star-full) Detected";
        items.unshift(suggestedItem);
      }
    }

    const selection = await vscode.window.showQuickPick(items, {
      placeHolder: "Select your target framework for code generation",
      ignoreFocusOut: true,
      title: "DevOmni Setup: Target Framework",
    });

    return selection?.value;
  }

  /**
   * Output Directory Selection
   *
   * WHY CONFIGURABLE OUTPUT DIRECTORY:
   * - Different projects have different folder structures
   * - Some projects want generated code in specific locations
   * - Enables separation of generated vs hand-written code
   * - Allows integration with existing project conventions
   *
   * ALTERNATIVE: Fixed output directory
   * ❌ Problem: Doesn't work with all project structures
   * ❌ Problem: Can't integrate with existing conventions
   * ❌ Problem: Some projects need generated code in specific places
   */
  private async chooseOutputDirectory(
    suggested?: string
  ): Promise<string | undefined> {
    const suggestions = [
      "generated",
      "src/generated",
      "api/generated",
      "src/api/generated",
      "lib/generated",
    ];

    if (suggested && !suggestions.includes(suggested)) {
      suggestions.unshift(suggested);
    }

    const items = suggestions.map((dir) => ({
      label: `$(folder) ${dir}`,
      value: dir,
    }));

    items.push({
      label: "$(edit) Custom directory...",
      value: "__custom__",
    });

    const selection = await vscode.window.showQuickPick(items, {
      placeHolder: "Where should generated files be placed?",
      ignoreFocusOut: true,
      title: "DevOmni Setup: Output Directory",
    });

    if (!selection) return undefined;

    if (selection.value === "__custom__") {
      return await vscode.window.showInputBox({
        prompt:
          "Enter custom output directory path (relative to workspace root)",
        value: "generated",
        validateInput: (value) => {
          if (!value.trim()) return "Directory path cannot be empty";
          if (value.includes("..")) return 'Directory path cannot contain ".."';
          if (value.startsWith("/"))
            return "Directory path should be relative (no leading slash)";
          return null;
        },
      });
    }

    return selection.value;
  }

  /**
   * Test Configuration and Save
   *
   * WHY TEST BEFORE SAVE:
   * - Immediate feedback on configuration validity
   * - Prevents saving broken configurations
   * - User confidence that setup actually works
   * - Catch connection issues early
   *
   * ALTERNATIVE: Save first, test later
   * ❌ Problem: User might save broken configuration
   * ❌ Problem: Connection issues discovered during code generation
   * ❌ Problem: Bad user experience with delayed failure
   */
  private async testAndSaveConfiguration(
    config: ProjectConfig
  ): Promise<boolean> {
    return await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: "🧪 Testing DevOmni configuration...",
        cancellable: false,
      },
      async (progress) => {
        progress.report({ increment: 10, message: "Saving configuration..." });

        // Save configuration first
        await this.configManager.updateConfig(config);

        progress.report({ increment: 50, message: "Testing connection..." });

        // Test the connection
        const testResult = await this.configManager.testConnection();

        progress.report({ increment: 100, message: "Complete!" });

        if (testResult.success) {
          vscode.window.showInformationMessage(testResult.message);
          return true;
        } else {
          const retry = await vscode.window.showErrorMessage(
            testResult.message,
            "Retry Setup",
            "Save Anyway",
            "Cancel"
          );

          if (retry === "Retry Setup") {
            await this.startSetupWizard();
            return false; // Return false to indicate retry was attempted
          }

          return retry === "Save Anyway";
        }
      }
    );
  }

  /**
   * Setup Complete Message
   *
   * WHY DETAILED COMPLETION MESSAGE:
   * - Summarizes what was configured
   * - Provides next steps for user
   * - Gives confidence that setup worked
   * - Shows how to get started with code generation
   *
   * ALTERNATIVE: Simple "Setup complete" message
   * ❌ Problem: User doesn't know what was configured
   * ❌ Problem: No guidance on what to do next
   * ❌ Problem: Missed opportunity to educate user
   */
  private async showSetupComplete(config: ProjectConfig): Promise<void> {
    const message = `🎉 DevOmni project setup complete!

Configuration:
• Database: ${config.database} (${config.connectionProfile})
• Framework: ${config.targetFramework}
• Output: ${config.outputDirectory}/

Ready to generate APIs! Try asking GitHub Copilot:
"Generate CRUD APIs for users table"`;

    const action = await vscode.window.showInformationMessage(
      message,
      "Refresh Schema Now",
      "Generate APIs",
      "Done"
    );

    if (action === "Refresh Schema Now") {
      await vscode.commands.executeCommand("devomni.refreshSchema");
    } else if (action === "Generate APIs") {
      await vscode.commands.executeCommand("devomni.generateAPIs");
    }
  }
}
