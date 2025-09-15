import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
export class LighttpdConfig {
  static async generateConfig(options: {
    documentRoot: string;
    port: number;
    fastCgiScriptPath: string;
    accessLogPath?: string;
    errorLogPath?: string;
  }): Promise<string> {
    const {
      documentRoot,
      port,
      fastCgiScriptPath,
      accessLogPath,
      errorLogPath
    } = options;
    const config = `
# Lighttpd Configuration for React Native Static Server
# Generated automatically
# Basic server settings
server.modules = (
    "mod_access",
    "mod_alias",
    "mod_fastcgi",
    "mod_indexfile",
    "mod_dirlisting",
    "mod_staticfile",
    "mod_setenv"
)
# Server configuration
server.document-root = "${documentRoot}"
server.port = ${port}
server.bind = "0.0.0.0"
# Enable non-local connections
server.network-backend = "write"
# MIME types
mimetype.assign = (
    ".html" => "text/html",
    ".htm"  => "text/html",
    ".txt"  => "text/plain",
    ".css"  => "text/css",
    ".js"   => "application/javascript",
    ".json" => "application/json",
    ".xml"  => "application/xml",
    ".png"  => "image/png",
    ".jpg"  => "image/jpeg",
    ".jpeg" => "image/jpeg",
    ".gif"  => "image/gif",
    ".ico"  => "image/x-icon",
    ".svg"  => "image/svg+xml"
)
# Index files
index-file.names = ( "index.html", "index.htm" )
# Enable directory listings for debugging
dir-listing.activate = "enable"
dir-listing.hide-dotfiles = "enable"
# CORS headers for API endpoints
setenv.add-response-header = (
    "Access-Control-Allow-Origin" => "*",
    "Access-Control-Allow-Methods" => "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers" => "Content-Type, Authorization"
)
# FastCGI configuration for API endpoints
fastcgi.server = (
    "/api/" => ((
        "bin-path" => "node",
        "bin-environment" => (
            "NODE_PATH" => "/usr/local/lib/node_modules"
        ),
        "bin-copy-environment" => (
            "PATH", "SHELL", "USER", "HOME", "NODE_PATH"
        ),
        "socket" => "/tmp/lighttpd-fastcgi-api.socket",
        "check-local" => "disable",
        "max-procs" => 1,
        "kill-signal" => 9
    ))
)
# Custom FastCGI handler for our API
\$HTTP["url"] =~ "^/api/" {
    fastcgi.server = (
        "" => ((
            "bin-path" => "${fastCgiScriptPath}",
            "socket" => "/tmp/lighttpd-fastcgi-inferra.socket",
            "check-local" => "disable",
            "max-procs" => 1,
            "kill-signal" => 9,
            "bin-environment" => (
                "NODE_PATH" => "/usr/local/lib/node_modules"
            )
        ))
    )
}
# Static file serving
static-file.exclude-extensions = ( ".fcgi", ".php", ".rb", ".py" )
# Access control
\$HTTP["url"] =~ "\\.\\." {
    url.access-deny = ( "" )
}
# Hide sensitive files
\$HTTP["url"] =~ "\\.(conf|log)$" {
    url.access-deny = ( "" )
}
# Logging (optional)
${accessLogPath ? `server.accesslog = "${accessLogPath}"` : '# Access logging disabled'}
${errorLogPath ? `server.errorlog = "${errorLogPath}"` : '# Error logging disabled'}
# Performance tuning
server.max-connections = 100
server.max-worker = 4
server.max-keep-alive-requests = 10
server.max-keep-alive-idle = 5
# Security
server.reject-expect-100-with-417 = "disable"
`;
    return config.trim();
  }
  static async createConfigFile(options: {
    documentRoot: string;
    port: number;
    fastCgiScriptPath: string;
    accessLogPath?: string;
    errorLogPath?: string;
  }): Promise<string> {
    const cacheDir = FileSystem.cacheDirectory;
    if (!cacheDir) {
      throw new Error('Cache directory not available');
    }
    const configDir = `${cacheDir}lighttpd_config/`;
    const configDirInfo = await FileSystem.getInfoAsync(configDir);
    if (!configDirInfo.exists) {
      await FileSystem.makeDirectoryAsync(configDir, { intermediates: true });
    }
    const configContent = await this.generateConfig(options);
    const configPath = `${configDir}lighttpd.conf`;
    await FileSystem.writeAsStringAsync(configPath, configContent);
    return configPath;
  }
  static async cleanupConfig(): Promise<void> {
    try {
      const cacheDir = FileSystem.cacheDirectory;
      if (cacheDir) {
        const configDir = `${cacheDir}lighttpd_config/`;
        const configDirInfo = await FileSystem.getInfoAsync(configDir);
        if (configDirInfo.exists) {
          await FileSystem.deleteAsync(configDir, { idempotent: true });
        }
      }
    } catch (error) {
    }
  }
  static getDefaultOptions(documentRoot: string, port: number, fastCgiScriptPath: string) {
    const cacheDir = FileSystem.cacheDirectory || '/tmp';
    return {
      documentRoot,
      port,
      fastCgiScriptPath,
      accessLogPath: `${cacheDir}lighttpd_access.log`,
      errorLogPath: `${cacheDir}lighttpd_error.log`
    };
  }
}