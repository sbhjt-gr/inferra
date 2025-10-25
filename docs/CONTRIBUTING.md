# Contributing to Inferra

Thank you for your interest in contributing to Inferra! This guide will help you understand how to contribute effectively to the project.

## Getting Started

### Finding Issues to Work On

Contributions are welcome! You can find reported bugs and feature requests in the [issues](https://github.com/sbhjt-gr/inferra/issues) tab. 

**Before starting work:**
1. Browse the issues tab to find something you want to work on
2. Comment on the issue expressing your interest in working on it
3. Wait to be assigned to the task before you start working
4. This helps avoid duplicate work and ensures coordination

### Proposing New Features

If you want to contribute a feature of your own, open a new issue first and describe your idea clearly. Your proposal should explain:

- **What the feature is**: A clear description of the functionality you want to add
- **Why it's useful**: The problem it solves or the value it adds to users
- **How you plan to implement it**: Your technical approach and any dependencies or changes required

After discussion and approval, you will be assigned to the issue and can start working on it.

## Code Guidelines

### Code Quality and Style

#### No Emojis
Do not use emojis in code, comments, commit messages, or user-facing text. They look unprofessional and can cause encoding issues. Use clear, descriptive text instead.

```typescript
// Bad
console.log('Model loaded successfully! 🎉');

// Good
console.log('Model loaded successfully');

// Good
console.log('model_load_success');
```

#### Clean Up Debug Logs
Remove all debug logs and console statements before submitting your pull request.

#### Meaningful Comments
Comments should explain why the code is implemented in a particular way, not what it does. The code itself should be clear enough to understand what it does.

```typescript
// Bad - stating the obvious
// Set the temperature to 0.7
const temperature = 0.7;

// Good - explaining the reasoning
// Use 0.7 temperature as a balance between creativity and coherence
// Lower values caused repetitive outputs in testing
const temperature = 0.7;
```

### React and React Native Best Practices

#### Avoid useEffect When Possible
Do not use `useEffect` unless really necessary. Most cases where developers reach for `useEffect` can be solved with better patterns.

**When NOT to use useEffect:**
- Transforming data for rendering (use variables or `useMemo` instead)
- Handling user events (use event handlers instead)
- Resetting state when props change (use the `key` prop or calculate during render)
- Updating state based on props/state changes (calculate during render)

```typescript
// Bad - unnecessary useEffect
const [filteredModels, setFilteredModels] = useState([]);

useEffect(() => {
  setFilteredModels(models.filter(m => m.size < maxSize));
}, [models, maxSize]);

// Good - calculate during render
const filteredModels = models.filter(m => m.size < maxSize);
```

**When to use useEffect:**
- Synchronizing with external systems (APIs, DOM, third-party libraries)
- Cleanup that must happen when component unmounts
- Setting up subscriptions or event listeners

```typescript
// Good use of useEffect - external system synchronization
useEffect(() => {
  const subscription = modelDownloader.on('progress', handleProgress);
  
  return () => {
    subscription.unsubscribe();
  };
}, []);
```

#### Component Organization
Keep components focused and under 1000 lines when possible. Break large components into smaller, reusable pieces.

### TypeScript Guidelines

#### Use Strict Types
Always use proper TypeScript types. Avoid `any` unless absolutely necessary.

```typescript
// Bad
function processMessage(message: any) {
  return message.content;
}

// Good
interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

function processMessage(message: Message): string {
  return message.content;
}
```

### File Naming and Organization

#### Naming Conventions
- Components: PascalCase (e.g., `ChatMessage.tsx`)
- Utilities: camelCase (e.g., `formatMessage.ts`)
- Services: PascalCase (e.g., `ModelDownloader.ts`)
- Types: PascalCase (e.g., `types/chat.ts`)

#### File Organization
Place files in the appropriate directory based on their purpose:
- UI components → `src/components/`
- Business logic → `src/services/`
- Utility functions → `src/utils/`
- Type definitions → `src/types/`
- React hooks → `src/hooks/`

### Manual Testing
Before submitting your PR:
1. Test on both iOS and Android if the change affects both platforms
2. Test with different models and configurations
3. Check for memory leaks in long-running operations
4. Verify the UI works on different screen sizes

## Code Attribution

When contributing code, especially for significant features or complex implementations, add attribution comments to identify who contributed the code. This helps with:
- Giving proper credit to contributors
- Providing context for future maintainers
- Building a record of community contributions

### Attribution Format

Add a comment at the top of new files or before significant code blocks:

```typescript
/**
 * Feature: RAG Document Ingestion
 * Contributed by: @username (https://github.com/username)
 * Issue: #123
 */

export class DocumentProcessor {
  // Implementation
}
```

For smaller contributions or modifications to existing code:

```typescript
// Enhanced error handling for streaming responses
// Contributed by: @username (https://github.com/username)
function handleStreamError(error: Error) {
  // Implementation
}
```

### What to Include
- Your GitHub username with a link to your profile
- The issue number if applicable
- Brief description of what the code does (optional, if not obvious from context)

This attribution is in addition to Git commit history and helps identify contributions at the code level.

## Git Workflow

### Branch Naming
Use descriptive branch names that indicate the type of change:
- `feature/add-rag-support`
- `fix/model-loading-crash`
- `docs/update-api-reference`
- `refactor/extract-chat-handlers`

### Commit Messages
Write clear, concise commit messages following this format:

```
type(scope): brief description

Longer explanation if needed

Fixes #123
```

Types:
- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

Examples:
```
feat(rag): add document ingestion endpoint
fix(server): resolve buffer encoding in streaming
docs(api): add embeddings endpoint documentation
refactor(tcp): extract model operations to separate file
```

### Pull Request Process

1. **Fork and Clone**: Fork the repository and clone it locally
2. **Create Branch**: Create a new branch for your feature or fix
3. **Make Changes**: Implement your changes following the guidelines
4. **Test**: Test your changes thoroughly
5. **Commit**: Make clean, logical commits with good messages
6. **Push**: Push your branch to your fork
7. **Pull Request**: Open a PR against the `main` branch

#### PR Description
Your pull request should include:
- Clear title describing the change
- Description of what was changed and why
- Reference to related issues (if any)

## License

By contributing to Inferra, you agree that your contributions will be licensed under the AGPL-3.0 License.

Thank you for contributing to Inferra!
