import fs from 'fs';
import path from 'path';
import os from 'os';

/**
 * Enhanced Profile Manager for Project-Based Database Configurations
 * 
 * WHY PROJECT-BASED PROFILES:
 * - Each project can have its own database configurations
 * - Easy switching between dev/staging/prod environments
 * - Version control friendly (can gitignore sensitive profiles)
 * - Multi-project workflows without interference
 * 
 * PROFILE RESOLUTION HIERARCHY:
 * 1. Project profiles (.devomni/profiles.json)
 * 2. Global profiles (~/.devomni/global-profiles.json)
 * 3. Environment variables (backward compatibility)
 */

export interface DatabaseProfile {
  postgres?: string;
  mysql?: string;
  mongo?: string;
}

export interface ProfileConfig {
  profiles: Record<string, DatabaseProfile>;
  activeProfile: string;
  defaultProfile: string;
}

export interface ProjectProfileConfig extends ProfileConfig {
  projectName?: string;
  createdAt?: string;
  lastUpdated?: string;
}

export class ProfileManager {
  private projectRoot: string;
  private globalProfilesPath: string;
  private projectProfilesPath: string;
  private activeProfilePath: string;

  constructor(projectRoot: string = process.cwd()) {
    // Force both Claude and VS Code to use the same project directory
    // This ensures perfect synchronization
    const forcedProjectRoot = "C:\\Users\\Varshil\\Desktop\\MyWebApps\\devomni-lite";
    
    this.projectRoot = forcedProjectRoot;
    this.globalProfilesPath = path.join(os.homedir(), '.devomni', 'global-profiles.json');
    this.projectProfilesPath = path.join(forcedProjectRoot, '.devomni', 'profiles.json');
    this.activeProfilePath = path.join(forcedProjectRoot, '.devomni', 'active-profile.txt');
    
    // Debug logging
    console.log('📂 ProfileManager initialized:');
    console.log('  Project Root:', this.projectRoot);
    console.log('  Profiles Path:', this.projectProfilesPath);
  }

  /**
   * Get all available profiles for current project
   * Merges project, global, and environment-based profiles
   */
  async getAllProfiles(): Promise<ProfileConfig> {
    const projectProfiles = await this.loadProjectProfiles();
    const globalProfiles = await this.loadGlobalProfiles();
    const envProfiles = this.getEnvironmentProfiles();

    // Merge profiles with project taking precedence
    const mergedProfiles: Record<string, DatabaseProfile> = {
      ...envProfiles.profiles,
      ...globalProfiles.profiles,
      ...projectProfiles.profiles
    };

    return {
      profiles: mergedProfiles,
      activeProfile: projectProfiles.activeProfile || globalProfiles.activeProfile || envProfiles.activeProfile,
      defaultProfile: projectProfiles.defaultProfile || globalProfiles.defaultProfile || envProfiles.defaultProfile
    };
  }

  /**
   * Load project-specific profiles from .devomni/profiles.json
   */
  private async loadProjectProfiles(): Promise<ProjectProfileConfig> {
    try {
      if (fs.existsSync(this.projectProfilesPath)) {
        const data = await fs.promises.readFile(this.projectProfilesPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error(`Error loading project profiles: ${error}`);
    }

    return { 
      profiles: {},
      activeProfile: 'default',
      defaultProfile: 'default'
    };
  }

  /**
   * Load global profiles from ~/.devomni/global-profiles.json
   */
  private async loadGlobalProfiles(): Promise<ProfileConfig> {
    try {
      if (fs.existsSync(this.globalProfilesPath)) {
        const data = await fs.promises.readFile(this.globalProfilesPath, 'utf8');
        return JSON.parse(data);
      }
    } catch (error) {
      console.error(`Error loading global profiles: ${error}`);
    }

    return { 
      profiles: {},
      activeProfile: 'default',
      defaultProfile: 'default'
    };
  }

  /**
   * Get profiles from environment variables (backward compatibility)
   */
  private getEnvironmentProfiles(): ProfileConfig {
    const profiles: Record<string, DatabaseProfile> = {};
    
    // Parse PostgreSQL environment variables
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('PG_') && key.includes('CONNECTION_STRING') && process.env[key]) {
        const profileName = key === 'PG_CONNECTION_STRING' ? 'default' : 
          key.replace('PG_', '').replace('_CONNECTION_STRING', '').toLowerCase();
        
        if (!profiles[profileName]) profiles[profileName] = {};
        profiles[profileName].postgres = process.env[key];
      }
    });

    // Parse MySQL environment variables
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('MYSQL_') && key.includes('CONNECTION_STRING') && process.env[key]) {
        const profileName = key === 'MYSQL_CONNECTION_STRING' ? 'default' :
          key.replace('MYSQL_', '').replace('_CONNECTION_STRING', '').toLowerCase();
        
        if (!profiles[profileName]) profiles[profileName] = {};
        profiles[profileName].mysql = process.env[key];
      }
    });

    // Parse MongoDB environment variables
    Object.keys(process.env).forEach(key => {
      if (key.startsWith('MONGODB_') && key.endsWith('_URI') && process.env[key]) {
        const profileName = key === 'MONGODB_URI' ? 'default' :
          key.replace('MONGODB_', '').replace('_URI', '').toLowerCase();
        
        if (!profiles[profileName]) profiles[profileName] = {};
        profiles[profileName].mongo = process.env[key];
      }
    });

    return {
      profiles,
      activeProfile: 'default',
      defaultProfile: 'default'
    };
  }

  /**
   * Get active profile name
   */
  async getActiveProfile(): Promise<string> {
    try {
      if (fs.existsSync(this.activeProfilePath)) {
        const activeProfile = await fs.promises.readFile(this.activeProfilePath, 'utf8');
        return activeProfile.trim();
      }
    } catch (error) {
      console.error(`Error reading active profile: ${error}`);
    }

    const config = await this.getAllProfiles();
    return config.activeProfile || config.defaultProfile || 'default';
  }

  /**
   * Set active profile for current project
   */
  async setActiveProfile(profileName: string): Promise<void> {
    const config = await this.getAllProfiles();
    
    if (!config.profiles[profileName]) {
      throw new Error(`Profile '${profileName}' not found. Available profiles: ${Object.keys(config.profiles).join(', ')}`);
    }

    // Ensure .devomni directory exists
    const devomniDir = path.dirname(this.activeProfilePath);
    if (!fs.existsSync(devomniDir)) {
      await fs.promises.mkdir(devomniDir, { recursive: true });
    }

    // Save active profile
    await fs.promises.writeFile(this.activeProfilePath, profileName, 'utf8');

    // Update project profiles config if it exists
    const projectConfig = await this.loadProjectProfiles();
    if (Object.keys(projectConfig.profiles).length > 0) {
      projectConfig.activeProfile = profileName;
      projectConfig.lastUpdated = new Date().toISOString();
      await this.saveProjectProfiles(projectConfig);
    }
  }

  /**
   * Create a new profile in current project
   */
  async createProfile(profileName: string, databases: DatabaseProfile): Promise<void> {
    let projectConfig = await this.loadProjectProfiles();

    // Initialize project config if it doesn't exist
    if (Object.keys(projectConfig.profiles).length === 0) {
      projectConfig = {
        profiles: {},
        projectName: path.basename(this.projectRoot),
        createdAt: new Date().toISOString(),
        activeProfile: profileName,
        defaultProfile: profileName
      };
    }

    // Add new profile
    projectConfig.profiles[profileName] = databases;
    projectConfig.lastUpdated = new Date().toISOString();

    // Set as active if it's the first profile
    if (Object.keys(projectConfig.profiles).length === 1) {
      projectConfig.activeProfile = profileName;
    }

    await this.saveProjectProfiles(projectConfig);

    // Set as active profile
    await this.setActiveProfile(profileName);
  }

  /**
   * Delete a profile from current project
   */
  async deleteProfile(profileName: string): Promise<void> {
    const projectConfig = await this.loadProjectProfiles();
    
    if (!projectConfig.profiles[profileName]) {
      throw new Error(`Profile '${profileName}' not found in project profiles`);
    }

    if (profileName === 'default') {
      throw new Error('Cannot delete default profile');
    }

    delete projectConfig.profiles[profileName];
    projectConfig.lastUpdated = new Date().toISOString();

    // If deleted profile was active, switch to default
    if (projectConfig.activeProfile === profileName) {
      projectConfig.activeProfile = projectConfig.defaultProfile || 'default';
      await this.setActiveProfile(projectConfig.activeProfile);
    }

    await this.saveProjectProfiles(projectConfig);
  }

  /**
   * Get connection string for specific database and profile
   */
  async getConnectionString(database: 'postgres' | 'mysql' | 'mongo', profileName?: string): Promise<string | undefined> {
    const activeProfile = profileName || await this.getActiveProfile();
    const config = await this.getAllProfiles();
    
    const profile = config.profiles[activeProfile];
    if (!profile) {
      throw new Error(`Profile '${activeProfile}' not found`);
    }

    return profile[database];
  }

  /**
   * List all available profile names
   */
  async listProfiles(): Promise<string[]> {
    const config = await this.getAllProfiles();
    return Object.keys(config.profiles);
  }

  /**
   * Get profile information for VS Code extension
   */
  async getProfileInfo(): Promise<Array<{
    name: string;
    databases: string[];
    isActive: boolean;
    source: 'project' | 'global' | 'environment';
  }>> {
    const config = await this.getAllProfiles();
    const activeProfile = await this.getActiveProfile();
    const projectConfig = await this.loadProjectProfiles();
    const globalConfig = await this.loadGlobalProfiles();

    return Object.entries(config.profiles).map(([name, databases]) => {
      let source: 'project' | 'global' | 'environment' = 'environment';
      
      if (projectConfig.profiles[name]) source = 'project';
      else if (globalConfig.profiles[name]) source = 'global';

      return {
        name,
        databases: Object.keys(databases).filter(db => databases[db as keyof DatabaseProfile]),
        isActive: name === activeProfile,
        source
      };
    });
  }

  /**
   * Save project profiles to file
   */
  private async saveProjectProfiles(config: ProjectProfileConfig): Promise<void> {
    const devomniDir = path.dirname(this.projectProfilesPath);
    if (!fs.existsSync(devomniDir)) {
      await fs.promises.mkdir(devomniDir, { recursive: true });
    }

    await fs.promises.writeFile(
      this.projectProfilesPath,
      JSON.stringify(config, null, 2),
      'utf8'
    );
  }

  /**
   * Check if current directory is a valid project root
   */
  isValidProject(): boolean {
    // Check for common project indicators
    const indicators = [
      'package.json',
      'requirements.txt', 
      'composer.json',
      'pom.xml',
      'Cargo.toml',
      '.git'
    ];

    return indicators.some(indicator => 
      fs.existsSync(path.join(this.projectRoot, indicator))
    );
  }
}