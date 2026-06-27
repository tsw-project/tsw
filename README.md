# tsw

_⚠️Warning: This project is very early in development and should not be used in production environments._

[Documentation](https://tsw-project.github.io/tsw/)

`tsw` is a TypeScript-to-MapleStory Worlds (.mlua) transpiler, allowing more powerful type-checking capabilities and various other quality of life improvements.

---

## Feature Map

`tsw` supports a subset of _TypeScript_ and _TypeScriptToLua_ functionality that is compatible with the `.mlua` format.

| Feature                                     | Status  | Notes                       |
|---------------------------------------------|---------|-----------------------------|
| MSW Classes (`Logic`, `Component` etc.)     | ✅      | [Documentation](https://tsw-project.github.io/tsw/docs/msw-class)                             |
| MSW Decorators (`@Sync`, `@ExecSpace` etc.) | ✅      | [Documentation](https://tsw-project.github.io/tsw/docs/msw-class)                            |
| Free functions                              | ✅      | [Documentation](https://tsw-project.github.io/tsw/docs/globals)                            |
| Global variables                            | ✅      | [Documentation](https://tsw-project.github.io/tsw/docs/globals)                             |
| Classes                                     | ✅      | [Documentation](https://tsw-project.github.io/tsw/docs/globals)                             |
| Promises                                    | ✅      |                             |
| Exceptions                                  | ✅      |                             |
| TSTL library / `lualib_bundle.lua`          | ✅      | Injected globally           |
| Exception Source Maps                       | 🚧      |                             |
| Debugger Source Maps                        | ❌      | Not possible                |
| npm modules                                 | ❌      | Not possible                |
| `JSON`             | ❌      | [Discussion](https://tsw-project.github.io/tsw/docs/scope#json)           |
| `import` / `export` / `require`             | ❌      | [Discussion](https://tsw-project.github.io/tsw/docs/scope#import--export--require)           |

## Getting Started

### 1. Prerequisites

- Install [Node.js](https://nodejs.org/en)

### 2. Installation

Install the transpiler globally via npm:

```bash
npm i -g @tsw-project/tsw
```

### 3. Setup

1. Open your MapleStory Worlds project.
2. Go to **Edit > WorldConfig** and enable:
* `LocalWorkspace`
* `UseExtendedScriptFormat`

3. Navigate to your local project folder in your terminal and run:
```bash
tsw init
```

### 4. Create Script

Create a `Scripts` directory in your project root and add your `.ts` files:

**Scripts/SomeFile.ts**

```ts
function FreeFunction() {
    print('hi from free function!')
}

@LogicClass
class LogicClass extends Logic {
    OnBeginPlay(): void {
        FreeFunction()
    }
} 
```

### 5. Build

_Run in your MapleStory Worlds project root._

**Building**

```
tsw build
```

**Watching**

```
tsw watch
```