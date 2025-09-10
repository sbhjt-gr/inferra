import { Platform } from 'react-native';

export type FileType = 'pdf' | 'text' | 'image' | 'unknown';

const TEXT_FILE_EXTENSIONS = [
  '.c', '.cpp', '.cc', '.h', '.hpp', '.hh', '.java', '.kt', '.kts',
  '.py', '.js', '.ts', '.jsx', '.tsx', '.cs', '.rb', '.php', '.go',
  '.rs', '.swift', '.sh', '.bash', '.zsh', '.bat', '.cmd', '.ps1', '.pl',
  '.lua', '.scala', '.r', '.m', '.vb', '.dart', '.clj', '.groovy', '.nim',
  '.asm', '.s', '.vhd', '.vhdl', '.ada', '.ml', '.fs', '.ex', '.exs',
  
  '.html', '.htm', '.xml', '.xhtml', '.svg', '.json', '.yaml', '.yml',
  '.ini', '.toml', '.cfg', '.conf', '.cnf', '.rc', '.properties', '.desktop', '.plist',
  '.csv', '.tsv', '.dbml', '.sql', '.psql', '.cql', '.graphql', '.gql',
  
  '.md', '.markdown', '.txt', '.text', '.rst', '.adoc', '.asciidoc', '.log', '.nfo',
  '.msg', '.out', '.todo', '.readme', '.license', '.changelog', '.changes', '.spec',
  
  '.env', '.editorconfig', '.gitattributes', '.gitignore', '.npmrc', '.yarnrc', '.babelrc', '.eslintrc',
  '.prettierrc', '.watchmanconfig', '.buckconfig', '.bazelrc', '.tool-versions', '.zshrc', '.bashrc', '.profile',
  '.pbxproj', '.xcconfig', '.gradle', '.build.gradle', '.settings.gradle', 'Makefile', 'Dockerfile', 'Procfile',
  'CMakeLists.txt', '.cmake', 'Vagrantfile', 'Jenkinsfile', '.gitmodules', '.dockerignore',
  
  '.lyrics', '.lst', '.list', '.dic', '.tex', '.sty', '.cls', '.aux', '.bbl',
  '.latexmkrc', '.fls', '.fdb_latexmk', '.toc', '.snippets', '.theme', '.colorscheme', '.cfg.xml',
  
  '.m3u', '.m3u8', '.pls', '.cue', '.srt', '.vtt', '.ass', '.ssa'
];

const IMAGE_FILE_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg', '.tiff', '.tif', '.ico', '.heic', '.heif'
];

export function getFileType(fileName: string): FileType {
  if (!fileName) return 'unknown';
  
  const lowerCaseName = fileName.toLowerCase();
  
  if (lowerCaseName.endsWith('.pdf')) {
    return 'pdf';
  }
  
  for (const ext of IMAGE_FILE_EXTENSIONS) {
    if (lowerCaseName.endsWith(ext)) {
      return 'image';
    }
  }
  
  for (const ext of TEXT_FILE_EXTENSIONS) {
    if (lowerCaseName.endsWith(ext)) {
      return 'text';
    }
  }
  
  if (!lowerCaseName.includes('.')) {
    return 'text';
  }
  
  return 'unknown';
}

export function formatFilePath(path: string): string {
  if (path.startsWith('file://')) {
    return path;
  }
  return Platform.OS === 'ios' ? `file://${path}` : path;
} 
