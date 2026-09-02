import { Duration } from "aws-cdk-lib";
import { Effect, PolicyStatement } from "aws-cdk-lib/aws-iam";
import { ApplicationLogLevel, Architecture, LoggingFormat, Runtime } from "aws-cdk-lib/aws-lambda";
import { BundlingOptions, NodejsFunction } from "aws-cdk-lib/aws-lambda-nodejs";
import { Construct } from "constructs";

export type VanillaLambdaProps = {
    functionName: string;
    handler: string;
    entry: string;
    memorySize?: number;
    timeout?: Duration;
    runtime?: Runtime;
    architecture?: Architecture;
    environment?: Record<string, string>;
    dynamoDbPermissions?: {
        readWrite?: string[];
        scan?: string[];
        delete?: string[];
    };
    sqsPermissions?: {
        send?: string[];
        receive?: string[];
    };
    pinpointPermissions?: {
        sendMessages: string[];
    };
    endUserMessaging?: {
        sendSMS: string[];
    };
    secretsManagerPermissions?: {
        getSecretValue: string[];
    };
    esPermissions?: {
        readAndWrite?: string[];
        read?: string[];
        delete?: string[];
        allActions?: string[];
    };
    eventBridgePermissions?: {
        putEvents?: string[];
    };
    s3Permissions?: {
        putObject?: string[];
        getObject?: string[];
        getBucketLocation?: string[];
    };
    /**
     * Grants `ses:SendEmail` + `ses:SendRawEmail`. `sendEmail` = IAM `resources`: pass SES
     * verified-identity ARNs (domain identity preferred), not email addresses. Don't use `["*"]`.
     * Format:  `arn:aws:ses:<region>:<account-id>:identity/<domain>`
     * Example: `sendEmail: ["arn:aws:ses:us-east-1:111122223333:identity/example.com"]`
     * A domain identity covers any From address at that domain.
     */
    sesPermissions?: {
        sendEmail: string[];
    };
    applicationLogLevel?: ApplicationLogLevel;
    reservedConcurrentExecutions?: number;
    deadLetterQueueEnabled?: boolean;
    bundlingOptions?: BundlingOptions;
};

/**
 * A vanilla lambda function with some common configurations
 *
 * Defaults:
 * - runtime: NODEJS_24_X
 * - memorySize: 1024
 * - timeout: 900 seconds
 * - architecture: ARM_64
 *
 * Permissions:
 * - DynamoDB.readWrite: PutItem, GetItem, Query, UpdateItem, BatchWriteItem, BatchGetItem
 * - DynamoDB.scan: Scan
 * - DynamoDB.delete: DeleteItem
 * - SQS.send: SendMessage
 * - SQS.receive: DeleteMessage, GetQueueAttributes, ReceiveMessage
 * - ES.read: ESHttpGet, ESHttpHead (not sufficient for body-based `_search`/`_msearch`,
 *   which OpenSearch/Elasticsearch issue as POST — use ES.readAndWrite for those callers,
 *   since verb-based IAM cannot grant POST without also granting writes)
 * - ES.readAndWrite: ESHttpGet, ESHttpHead, ESHttpPost, ESHttpPut
 * - ES.delete: ESHttpDelete
 * - ES.allActions: es:* (prefer the scoped keys above)
 *
 * Environment:
 * - TZ: Asia/Calcutta (You can override this by passing TZ in environment)
 */
export class VanillaLambda extends NodejsFunction {
    constructor(scope: Construct, id: string, props: VanillaLambdaProps) {
        super(scope, id, {
            functionName: props.functionName,
            memorySize: props.memorySize ?? 1024,
            timeout: props.timeout ?? Duration.seconds(900),
            runtime: props.runtime ?? Runtime.NODEJS_24_X,
            architecture: props.architecture ?? Architecture.ARM_64,
            handler: props.handler,
            entry: props.entry,
            awsSdkConnectionReuse: true,
            environment: {
                TZ: "Asia/Calcutta",
                ...(props.environment ?? {}),
            },
            loggingFormat: LoggingFormat.JSON,
            applicationLogLevelV2: props.applicationLogLevel ?? ApplicationLogLevel.INFO,
            reservedConcurrentExecutions: props.reservedConcurrentExecutions,
            deadLetterQueueEnabled: props.deadLetterQueueEnabled ? props.deadLetterQueueEnabled : undefined,
            bundling: {
                ...props.bundlingOptions,
                // The Node.js Lambda runtime already ships AWS SDK v3, so never
                // bundle it (or @smithy) — doing so bloats every function and
                // was a primary cause of out-of-memory failures.
                // Not covered by a test: esbuild's bundling config is a build-time
                // concern and never appears in the synthesized CloudFormation template,
                // so Template.fromStack cannot assert externalModules. Do not remove
                // this merge based on an absence of test coverage for it.
                externalModules: ["@aws-sdk/*", "@smithy/*", ...(props.bundlingOptions?.externalModules ?? [])],
            },
        });
        if (props.dynamoDbPermissions) {
            if (props.dynamoDbPermissions.readWrite) {
                const resources = [...props.dynamoDbPermissions.readWrite];
                while (resources.length > 0) {
                    this.addToRolePolicy(
                        new PolicyStatement({
                            effect: Effect.ALLOW,
                            actions: [
                                "dynamodb:PutItem",
                                "dynamodb:GetItem",
                                "dynamodb:Query",
                                "dynamodb:UpdateItem",
                                "dynamodb:BatchWriteItem",
                                "dynamodb:BatchGetItem",
                            ],
                            resources: resources.splice(0, 20),
                        })
                    );
                }
            }

            if (props.dynamoDbPermissions.scan) {
                this.addToRolePolicy(
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: ["dynamodb:Scan"],
                        resources: props.dynamoDbPermissions.scan,
                    })
                );
            }

            if (props.dynamoDbPermissions.delete) {
                this.addToRolePolicy(
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: ["dynamodb:DeleteItem"],
                        resources: props.dynamoDbPermissions.delete,
                    })
                );
            }
        }
        if (props.secretsManagerPermissions) {
            if (props.secretsManagerPermissions.getSecretValue) {
                this.addToRolePolicy(
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: ["secretsmanager:GetSecretValue"],
                        resources: props.secretsManagerPermissions.getSecretValue,
                    })
                );
            }
        }

        if (props.esPermissions) {
            if (props.esPermissions.allActions) {
                this.addToRolePolicy(
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: ["es:*"],
                        resources: props.esPermissions.allActions,
                    })
                );
            }

            if (props.esPermissions.read) {
                this.addToRolePolicy(
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: ["es:ESHttpGet", "es:ESHttpHead"],
                        resources: props.esPermissions.read,
                    })
                );
            }

            if (props.esPermissions.readAndWrite) {
                this.addToRolePolicy(
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: ["es:ESHttpGet", "es:ESHttpHead", "es:ESHttpPost", "es:ESHttpPut"],
                        resources: props.esPermissions.readAndWrite,
                    })
                );
            }

            if (props.esPermissions.delete) {
                this.addToRolePolicy(
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: ["es:ESHttpDelete"],
                        resources: props.esPermissions.delete,
                    })
                );
            }
        }
        if (props.eventBridgePermissions) {
            if (props.eventBridgePermissions.putEvents) {
                this.addToRolePolicy(
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: ["events:PutEvents"],
                        resources: props.eventBridgePermissions.putEvents,
                    })
                );
            }
        }
        if (props.sqsPermissions) {
            if (props.sqsPermissions.send && props.sqsPermissions.send.length > 0) {
                this.addToRolePolicy(
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: ["sqs:SendMessage"],
                        resources: props.sqsPermissions.send,
                    })
                );
            }

            if (props.sqsPermissions.receive && props.sqsPermissions.receive.length > 0) {
                this.addToRolePolicy(
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: ["sqs:DeleteMessage", "sqs:GetQueueAttributes", "sqs:ReceiveMessage"],
                        resources: props.sqsPermissions.receive,
                    })
                );
            }
        }
        if (props.s3Permissions) {
            if (props.s3Permissions.putObject) {
                this.addToRolePolicy(
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: [
                            "s3:AbortMultipartUpload",
                            "s3:ListBucket",
                            "s3:ListBucketMultipartUploads",
                            "s3:PutObject",
                        ],
                        resources: props.s3Permissions.putObject,
                    })
                );
            }
            if (props.s3Permissions.getObject) {
                this.addToRolePolicy(
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: ["s3:GetObject"],
                        resources: props.s3Permissions.getObject,
                    })
                );
            }
            if (props.s3Permissions.getBucketLocation) {
                this.addToRolePolicy(
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: ["s3:GetBucketLocation"],
                        resources: props.s3Permissions.getBucketLocation,
                    })
                );
            }
        }
        if (props.pinpointPermissions) {
            if (props.pinpointPermissions.sendMessages) {
                this.addToRolePolicy(
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: ["mobiletargeting:SendUsersMessages", "mobiletargeting:PutEvents"],
                        resources: props.pinpointPermissions.sendMessages,
                    })
                );
            }
        }

        if (props.endUserMessaging) {
            if (props.endUserMessaging.sendSMS) {
                this.addToRolePolicy(
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: ["sms-voice:SendTextMessage"],
                        resources: props.endUserMessaging.sendSMS,
                    })
                );
            }
        }

        if (props.sesPermissions) {
            if (props.sesPermissions.sendEmail) {
                // resources = SES verified-identity ARNs, e.g. arn:aws:ses:<region>:<account>:identity/<domain>
                this.addToRolePolicy(
                    new PolicyStatement({
                        effect: Effect.ALLOW,
                        actions: ["ses:SendEmail", "ses:SendRawEmail"],
                        resources: props.sesPermissions.sendEmail,
                    })
                );
            }
        }
    }
}
