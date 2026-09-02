# AGENTS.md

This file provides guidance to coding agents when working in this repository.

## Commands

```bash
npm run build       # tsup -> dist/
npm test            # jest
npm run typecheck   # tsc --noEmit
npm run lint        # eslint .
```

## Architecture

A pure CDK construct library. Six constructs in `lib/`, five of them exported from
`src/index.ts`:

| Construct | Exported | Creates |
|---|---|---|
| `VanillaLambda` | yes | `NodejsFunction` with opinionated defaults + declarative IAM permission props |
| `VanillaDDBTable` | yes | DynamoDB table, deletion protection, `NEW_AND_OLD_IMAGES` stream, stream-ARN output |
| `SQSLambda` | yes | `VanillaSQS` + `VanillaLambda` + `SqsEventSource`, visibility timeout floored at the Lambda timeout |
| `CronLambda` | yes | `VanillaLambda` + EventBridge Scheduler `CfnSchedule` + invoker role |
| `EventProcessingLambda` | yes | `VanillaLambda` + EventBridge `Rule` |
| `VanillaSQS` | **no** | Queue + DLQ pair, FIFO-aware. Internal to `SQSLambda`; its type is reachable via `SQSLambdaProps.sqsProps`. |

## Conventions

- `aws-cdk-lib` and `constructs` are **peer** dependencies. Never promote them to
  `dependencies` — a second copy of `constructs` in a consumer's tree breaks `instanceof`
  at synth time.
- Permission props take IAM `resources` arrays and grant a fixed action set. Add
  permissions by adding a prop, not by having callers attach policies directly.
- Tests are `Template.fromStack` assertions. `VanillaLambda` and anything composing it
  need a real `entry` file — use `FIXTURE_ENTRY` from `test/helpers/synth.ts`.
- Changing any construct `id` string or tree nesting shifts CloudFormation logical IDs and
  will replace live resources. Don't, without a deliberate migration.
- No secrets, account IDs, ARNs, or internal domain names anywhere — including JSDoc
  examples. This is a public repository. Use AWS's placeholders (`111122223333`,
  `example.com`).

## Publishing

`@superk-in/cdk-constructs`, public on npm. `prepublishOnly` runs `build` then `test`;
`files: ["dist"]` means only the built output ships. Bump the version in `package.json`
and `npm publish`. On `0.x`, minor bumps may break — see the design spec.
