# tsw

**Warning: This is for reference only. The code is not remotely production-ready**

## Requirements

- [bun](https://bun.com/)

## Usage

Create a `Script` directory in your msw project, and create `@Logic` classes inside:

```
@LogicClass
class TSLogic extends Logic {
    @Sync
    hp: number = 100

    OnBeginPlay(): void {
        print('hi!')
    }
}
declare const _TSLogic: TSLogic
```

Then build them from the root of this repository:

`bun run start -- watch --cwd <path-to-msw-project>`