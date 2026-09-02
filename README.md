# @superk-in/cdk-constructs

Opinionated AWS CDK constructs for serverless services: Lambda functions with
declarative IAM, DynamoDB tables with streams, SQS queue/DLQ pairs, EventBridge rules,
and EventBridge Scheduler cron jobs.

The `Vanilla*` prefix means "our defaults already applied" — these are **not** thin
wrappers. Each construct encodes production defaults (ARM64, Node 24, JSON logging,
deletion protection) that you can override per prop.

## Install

```bash
npm install @superk-in/cdk-constructs
```

`aws-cdk-lib` and `constructs` are peer dependencies:

```bash
npm install aws-cdk-lib@^2.266.0 constructs@^10.8.1
```

**Bundling prerequisite:** `VanillaLambda`, and every construct built on top of it
(`SQSLambda`, `CronLambda`, `EventProcessingLambda`), use CDK's `NodejsFunction`, which
bundles handler code with esbuild at synth time. Your consuming project needs either a
local `esbuild` install or Docker available — without one, `cdk synth`/`cdk deploy` fails
outright.

## Constructs

### VanillaLambda

A `NodejsFunction` with opinionated defaults and declarative IAM permission props.

```ts
import { VanillaLambda } from "@superk-in/cdk-constructs";
import { Duration } from "aws-cdk-lib";

const fn = new VanillaLambda(this, "ProcessWidgets", {
    functionName: "process-widgets",
    handler: "handler",
    entry: "src/handlers/process-widgets.ts",
    timeout: Duration.minutes(5),
    dynamoDbPermissions: {
        readWrite: [widgetTable.tableArn, `${widgetTable.tableArn}/index/*`],
    },
    sqsPermissions: { send: [outboundQueue.queueArn] },
});
```

**Defaults:** Node 24, ARM64, 1024 MB, 900 s timeout, JSON logging at `INFO`,
`TZ=Asia/Calcutta`, SDK connection reuse. The AWS SDK v3 (`@aws-sdk/*`, `@smithy/*`) is
always excluded from the bundle — the Lambda runtime already ships it, and bundling it
bloats the artifact and was a primary cause of out-of-memory failures.

**Runtime default:** this construct defaults to `NODEJS_24_X` (Node 24, the current
Lambda LTS) — pass `runtime` explicitly to override. The default is pinned to that exact
runtime rather than CDK's `NODEJS_LATEST` alias, so upgrading `aws-cdk-lib` will never
silently change the runtime of functions that rely on the default.

**Expected `TZ` warning:** because of the `TZ: Asia/Calcutta` default, CDK emits
`E3663` ("Environment variable 'TZ' is a Lambda reserved key") on every synth. This is
expected and harmless, not a bug in this library — override `TZ` via `environment` if you
need a different value.

**Permission props** — each takes IAM `resources` and grants a fixed action set:

| Prop | Grants |
|---|---|
| `dynamoDbPermissions.readWrite` | `PutItem`, `GetItem`, `Query`, `UpdateItem`, `BatchWriteItem`, `BatchGetItem` |
| `dynamoDbPermissions.scan` | `Scan` |
| `dynamoDbPermissions.delete` | `DeleteItem` |
| `sqsPermissions.send` | `SendMessage` |
| `sqsPermissions.receive` | `DeleteMessage`, `GetQueueAttributes`, `ReceiveMessage` |
| `s3Permissions.putObject` | `AbortMultipartUpload`, `ListBucket`, `ListBucketMultipartUploads`, `PutObject` |
| `s3Permissions.getObject` | `GetObject` |
| `s3Permissions.getBucketLocation` | `GetBucketLocation` |
| `eventBridgePermissions.putEvents` | `events:PutEvents` |
| `secretsManagerPermissions.getSecretValue` | `secretsmanager:GetSecretValue` |
| `esPermissions.read` | `es:ESHttpGet`, `es:ESHttpHead` |
| `esPermissions.readAndWrite` | the above plus `es:ESHttpPost`, `es:ESHttpPut` |
| `esPermissions.delete` | `es:ESHttpDelete` |
| `esPermissions.allActions` | `es:*` — prefer the scoped keys above |
| `sesPermissions.sendEmail` | `ses:SendEmail`, `ses:SendRawEmail` |
| `pinpointPermissions.sendMessages` | `mobiletargeting:SendUsersMessages`, `mobiletargeting:PutEvents` |
| `endUserMessaging.sendSMS` | `sms-voice:SendTextMessage` |

**A limitation of `esPermissions.read`:** OpenSearch and Elasticsearch issue `_search`
and `_msearch` as POST requests with a JSON body, so `read` (which grants only
`es:ESHttpGet` and `es:ESHttpHead`) is not sufficient for body-based search. Use
`readAndWrite` for those callers. `read` deliberately excludes `es:ESHttpPost` because
the verb-based IAM model cannot separate a POST search from a POST document write —
granting it under `read` would confer write access.

`dynamoDbPermissions.readWrite` splits into multiple policy statements past 20 resources
to stay under the IAM policy size limit. Other permission props emit a single statement.

### VanillaDDBTable

A DynamoDB table with streams on and a CloudFormation output for the stream ARN.

```ts
const table = new VanillaDDBTable(this, "WidgetTable", {
    tableName: "widget-table",
    partitionKey: { name: "widgetId", type: AttributeType.STRING },
    sortKey: { name: "createdAt", type: AttributeType.STRING },
    timeToLiveAttribute: "expiresAt",
});
```

**Fixed:** deletion protection on, `PAY_PER_REQUEST` billing, `NEW_AND_OLD_IMAGES`
stream. Deletion protection is not currently overridable — a table created by this
construct cannot be destroyed by `cdk destroy` without first disabling it in the console.

Exports `${tableName}STREAM` as a CloudFormation output unless `disableStreamArnOutput`
is set. Access the underlying table via `.table`.

### SQSLambda

An SQS queue with a dead letter queue, plus a Lambda triggered by it.

```ts
const worker = new SQSLambda(this, "WidgetWorker", {
    sqsProps: { queueName: "widget-queue", visibilityTimeout: Duration.minutes(5) },
    lambdaProps: {
        functionName: "widget-worker",
        handler: "handler",
        entry: "src/handlers/widget-worker.ts",
        timeout: Duration.minutes(5),
    },
    sqsEventSourceProps: { batchSize: 10 },
});
```

The queue's visibility timeout is raised to at least the Lambda timeout. A DLQ named
`<queueName>DLQ` is created with `maxReceiveCount: 3`. FIFO is supported via
`sqsProps.fifo`, which appends `.fifo` to both queue names and enables content-based
deduplication. Event source defaults: `batchSize: 1`, `maxConcurrency: 10`.

**Always set `lambdaProps.timeout` explicitly.** If you omit it, the queue's visibility
floor is computed as 30 s while the function inherits the 900 s default.

Access members via `.sqs` and `.lambda`.

### CronLambda

A Lambda on an EventBridge Scheduler schedule.

```ts
const nightly = new CronLambda(this, "NightlyRollup", {
    lambdaProps: {
        functionName: "nightly-rollup",
        handler: "handler",
        entry: "src/handlers/nightly-rollup.ts",
    },
    scheduleProps: {
        scheduleExpression: "cron(30 2 * * ? *)",
        state: ScheduleState.ENABLED,
    },
});
```

Timezone defaults to `Asia/Calcutta`; set `scheduleExpressionTimezone` to change it.
Flexible time window is `OFF`. Access members via `.lambda` and `.schedule`.

### EventProcessingLambda

A Lambda triggered by an EventBridge rule.

```ts
const onWidgetCreated = new EventProcessingLambda(this, "OnWidgetCreated", {
    lambdaProps: {
        functionName: "on-widget-created",
        handler: "handler",
        entry: "src/handlers/on-widget-created.ts",
    },
    ruleProps: {
        eventPattern: { source: ["widget.service"], detailType: ["WidgetCreated"] },
    },
});
```

`ruleProps` passes straight through to CDK's `RuleProps`. Access members via
`.eventProcessingLambda` and `.rule`.

## What this is not

A construct library, not a CDK app — there is no `bin/` entrypoint and no `cdk.json`.
Import the constructs into your own stacks.

The `Vanilla*` props are a curated subset, not a passthrough. `vpc`, `layers`, `role`,
`initialPolicy`, and `filesystem` are not exposed; if you need them, this library is
probably not the right fit.

## License

MIT
