import { Duration } from "aws-cdk-lib";
import { Match } from "aws-cdk-lib/assertions";
import { Architecture, Runtime } from "aws-cdk-lib/aws-lambda";
import { VanillaLambda, VanillaLambdaProps } from "../lib/vanilla-lambda";
import { FIXTURE_ENTRY, synthStack } from "./helpers/synth";

const baseProps = {
    functionName: "test-fn",
    handler: "handler",
    entry: FIXTURE_ENTRY,
};

const DDB_ARN = "arn:aws:dynamodb:us-east-1:111122223333:table/widgets";
const SQS_ARN = "arn:aws:sqs:us-east-1:111122223333:widgets-queue";
const S3_ARN = "arn:aws:s3:::widgets-bucket";
const EVENTBRIDGE_ARN = "arn:aws:events:us-east-1:111122223333:event-bus/default";
const SECRET_ARN = "arn:aws:secretsmanager:us-east-1:111122223333:secret:widgets-secret";
const PINPOINT_ARN = "arn:aws:mobiletargeting:us-east-1:111122223333:apps/widgets-app";
const END_USER_MESSAGING_ARN = "arn:aws:sms-voice:us-east-1:111122223333:phone-number/widgets-number";
const SES_ARN = "arn:aws:ses:us-east-1:111122223333:identity/example.com";
const ES_ARN = "arn:aws:es:us-east-1:111122223333:domain/widgets/*";

describe("VanillaLambda", () => {
    it("synthesizes a Lambda function", () => {
        const template = synthStack((stack) => {
            new VanillaLambda(stack, "Fn", baseProps);
        });
        template.resourceCountIs("AWS::Lambda::Function", 1);
    });

    // Group 1: defaults
    it("applies opinionated defaults", () => {
        const template = synthStack((stack) => {
            new VanillaLambda(stack, "Fn", baseProps);
        });
        template.hasResourceProperties("AWS::Lambda::Function", {
            FunctionName: "test-fn",
            MemorySize: 1024,
            Timeout: 900,
            // Asserted as the exact string "nodejs24.x" (not NODEJS_LATEST) so this
            // test fails if the default ever gets swapped for CDK's floating
            // NODEJS_LATEST alias, which would let a future aws-cdk-lib upgrade
            // silently change the runtime of every function using the default.
            Runtime: "nodejs24.x",
            Architectures: ["arm64"],
            LoggingConfig: Match.objectLike({
                LogFormat: "JSON",
                ApplicationLogLevel: "INFO",
            }),
            Environment: {
                Variables: Match.objectLike({ TZ: "Asia/Calcutta" }),
            },
        });
    });

    // Group 2: overrides
    it("lets caller props override every default", () => {
        const template = synthStack((stack) => {
            new VanillaLambda(stack, "Fn", {
                ...baseProps,
                memorySize: 256,
                timeout: Duration.seconds(45),
                runtime: Runtime.NODEJS_18_X,
                architecture: Architecture.X86_64,
            });
        });
        template.hasResourceProperties("AWS::Lambda::Function", {
            MemorySize: 256,
            Timeout: 45,
            Runtime: "nodejs18.x",
            Architectures: ["x86_64"],
        });
    });

    it("lets the caller override the TZ environment variable", () => {
        const template = synthStack((stack) => {
            new VanillaLambda(stack, "Fn", {
                ...baseProps,
                environment: { TZ: "UTC", OTHER: "value" },
            });
        });
        template.hasResourceProperties("AWS::Lambda::Function", {
            Environment: {
                Variables: Match.objectLike({ TZ: "UTC", OTHER: "value" }),
            },
        });
    });

    // Group 3: IAM resource chunking
    it("splits dynamoDbPermissions.readWrite into 20-resource statements", () => {
        const resources = Array.from({ length: 45 }, (_, i) => `arn:aws:dynamodb:us-east-1:111122223333:table/t${i}`);
        const template = synthStack((stack) => {
            new VanillaLambda(stack, "Fn", {
                ...baseProps,
                dynamoDbPermissions: { readWrite: resources },
            });
        });
        const policies = template.findResources("AWS::IAM::Policy");
        const statements = Object.values(policies).flatMap(
            (p: any) => p.Properties.PolicyDocument.Statement as any[]
        );
        const ddbWrite = statements.filter(
            (s) => Array.isArray(s.Action) && s.Action.includes("dynamodb:PutItem")
        );
        // 45 resources chunked at 20 => 20 + 20 + 5
        expect(ddbWrite).toHaveLength(3);
        expect(ddbWrite.map((s) => s.Resource.length).sort((a, b) => b - a)).toEqual([20, 20, 5]);
    });

    // Group 4: one statement per permission block, table-driven so each prop is checked
    // in isolation for its exact action set AND its exact resource scoping. Using a
    // shared construct with a shared ARN (the previous shape) could not tell one
    // permission block's actions apart from another's, nor verify resource scoping at
    // all — swapping action sets between two blocks left the old test green.
    const permissionCases: Array<{
        name: string;
        props: Partial<VanillaLambdaProps>;
        arn: string;
        expected: string[];
    }> = [
        {
            name: "dynamoDbPermissions.readWrite",
            props: { dynamoDbPermissions: { readWrite: [DDB_ARN] } },
            arn: DDB_ARN,
            expected: [
                "dynamodb:PutItem",
                "dynamodb:GetItem",
                "dynamodb:Query",
                "dynamodb:UpdateItem",
                "dynamodb:BatchWriteItem",
                "dynamodb:BatchGetItem",
            ],
        },
        {
            name: "dynamoDbPermissions.scan",
            props: { dynamoDbPermissions: { scan: [DDB_ARN] } },
            arn: DDB_ARN,
            expected: ["dynamodb:Scan"],
        },
        {
            name: "dynamoDbPermissions.delete",
            props: { dynamoDbPermissions: { delete: [DDB_ARN] } },
            arn: DDB_ARN,
            expected: ["dynamodb:DeleteItem"],
        },
        {
            name: "sqsPermissions.send",
            props: { sqsPermissions: { send: [SQS_ARN] } },
            arn: SQS_ARN,
            expected: ["sqs:SendMessage"],
        },
        {
            name: "sqsPermissions.receive",
            props: { sqsPermissions: { receive: [SQS_ARN] } },
            arn: SQS_ARN,
            expected: ["sqs:DeleteMessage", "sqs:GetQueueAttributes", "sqs:ReceiveMessage"],
        },
        {
            name: "s3Permissions.putObject",
            props: { s3Permissions: { putObject: [S3_ARN] } },
            arn: S3_ARN,
            expected: ["s3:AbortMultipartUpload", "s3:ListBucket", "s3:ListBucketMultipartUploads", "s3:PutObject"],
        },
        {
            name: "s3Permissions.getObject",
            props: { s3Permissions: { getObject: [S3_ARN] } },
            arn: S3_ARN,
            expected: ["s3:GetObject"],
        },
        {
            name: "s3Permissions.getBucketLocation",
            props: { s3Permissions: { getBucketLocation: [S3_ARN] } },
            arn: S3_ARN,
            expected: ["s3:GetBucketLocation"],
        },
        {
            name: "eventBridgePermissions.putEvents",
            props: { eventBridgePermissions: { putEvents: [EVENTBRIDGE_ARN] } },
            arn: EVENTBRIDGE_ARN,
            expected: ["events:PutEvents"],
        },
        {
            name: "secretsManagerPermissions.getSecretValue",
            props: { secretsManagerPermissions: { getSecretValue: [SECRET_ARN] } },
            arn: SECRET_ARN,
            expected: ["secretsmanager:GetSecretValue"],
        },
        {
            name: "pinpointPermissions.sendMessages",
            props: { pinpointPermissions: { sendMessages: [PINPOINT_ARN] } },
            arn: PINPOINT_ARN,
            expected: ["mobiletargeting:SendUsersMessages", "mobiletargeting:PutEvents"],
        },
        {
            name: "endUserMessaging.sendSMS",
            props: { endUserMessaging: { sendSMS: [END_USER_MESSAGING_ARN] } },
            arn: END_USER_MESSAGING_ARN,
            expected: ["sms-voice:SendTextMessage"],
        },
        {
            name: "sesPermissions.sendEmail",
            props: { sesPermissions: { sendEmail: [SES_ARN] } },
            arn: SES_ARN,
            expected: ["ses:SendEmail", "ses:SendRawEmail"],
        },
        {
            name: "esPermissions.allActions",
            props: { esPermissions: { allActions: [ES_ARN] } },
            arn: ES_ARN,
            expected: ["es:*"],
        },
        {
            name: "esPermissions.read",
            props: { esPermissions: { read: [ES_ARN] } },
            arn: ES_ARN,
            expected: ["es:ESHttpGet", "es:ESHttpHead"],
        },
        {
            name: "esPermissions.readAndWrite",
            props: { esPermissions: { readAndWrite: [ES_ARN] } },
            arn: ES_ARN,
            expected: ["es:ESHttpGet", "es:ESHttpHead", "es:ESHttpPost", "es:ESHttpPut"],
        },
        {
            name: "esPermissions.delete",
            props: { esPermissions: { delete: [ES_ARN] } },
            arn: ES_ARN,
            expected: ["es:ESHttpDelete"],
        },
    ];

    it.each(permissionCases)("grants exactly the documented actions for $name", ({ props, arn, expected }) => {
        const template = synthStack((stack) => {
            new VanillaLambda(stack, "Fn", { ...baseProps, ...props });
        });
        const statements = Object.values(template.findResources("AWS::IAM::Policy")).flatMap(
            (p: any) => p.Properties.PolicyDocument.Statement as any[]
        );
        const matching = statements.filter((s) => {
            const actions = Array.isArray(s.Action) ? s.Action : [s.Action];
            return actions.some((a: string) => expected.includes(a));
        });
        // Exactly one statement should match this permission block — if two permission
        // blocks were cross-wired or merged, this would catch either direction.
        expect(matching).toHaveLength(1);
        const actions = Array.isArray(matching[0].Action) ? matching[0].Action : [matching[0].Action];
        // Exact set (sorted), not `toContain` — so an extra, unintended action also fails.
        expect([...actions].sort()).toEqual([...expected].sort());
        // CDK collapses a single-element `resources` array to a bare string.
        const resources = Array.isArray(matching[0].Resource) ? matching[0].Resource : [matching[0].Resource];
        expect(resources).toEqual([arn]);
    });

    it("emits no IAM statements for permission blocks that are omitted", () => {
        const template = synthStack((stack) => {
            new VanillaLambda(stack, "Fn", baseProps);
        });
        const policies = template.findResources("AWS::IAM::Policy");
        const actions = Object.values(policies)
            .flatMap((p: any) => p.Properties.PolicyDocument.Statement as any[])
            .flatMap((s) => (Array.isArray(s.Action) ? s.Action : [s.Action]));
        expect(actions).not.toContain("dynamodb:PutItem");
        expect(actions).not.toContain("es:*");
    });
});
