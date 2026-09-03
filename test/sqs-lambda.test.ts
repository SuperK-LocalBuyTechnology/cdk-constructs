import { Duration } from "aws-cdk-lib";
import { SQSLambda } from "../lib/sqs-lambda";
import { FIXTURE_ENTRY, synthStack } from "./helpers/synth";

const lambdaProps = {
    functionName: "test-fn",
    handler: "handler",
    entry: FIXTURE_ENTRY,
};

describe("SQSLambda", () => {
    it("creates a queue, a DLQ, and a function wired by an event source", () => {
        const template = synthStack((stack) => {
            new SQSLambda(stack, "SQSFn", {
                sqsProps: { queueName: "widget-queue" },
                lambdaProps: { ...lambdaProps, timeout: Duration.seconds(60) },
                sqsEventSourceProps: {},
            });
        });
        template.resourceCountIs("AWS::SQS::Queue", 2);
        template.resourceCountIs("AWS::Lambda::Function", 1);
        template.resourceCountIs("AWS::Lambda::EventSourceMapping", 1);
    });

    it("raises the queue visibility timeout to match a longer Lambda timeout", () => {
        const template = synthStack((stack) => {
            new SQSLambda(stack, "SQSFn", {
                sqsProps: { queueName: "widget-queue", visibilityTimeout: Duration.seconds(30) },
                lambdaProps: { ...lambdaProps, timeout: Duration.seconds(300) },
                sqsEventSourceProps: {},
            });
        });
        template.hasResourceProperties("AWS::SQS::Queue", {
            QueueName: "widget-queue",
            VisibilityTimeout: 300,
        });
    });

    it("keeps a longer queue visibility timeout when it exceeds the Lambda timeout", () => {
        const template = synthStack((stack) => {
            new SQSLambda(stack, "SQSFn", {
                sqsProps: { queueName: "widget-queue", visibilityTimeout: Duration.seconds(900) },
                lambdaProps: { ...lambdaProps, timeout: Duration.seconds(60) },
                sqsEventSourceProps: {},
            });
        });
        template.hasResourceProperties("AWS::SQS::Queue", {
            QueueName: "widget-queue",
            VisibilityTimeout: 900,
        });
    });

    it("defaults the event source to batchSize 1 and maxConcurrency 10", () => {
        const template = synthStack((stack) => {
            new SQSLambda(stack, "SQSFn", {
                sqsProps: { queueName: "widget-queue" },
                lambdaProps: { ...lambdaProps, timeout: Duration.seconds(60) },
                sqsEventSourceProps: {},
            });
        });
        template.hasResourceProperties("AWS::Lambda::EventSourceMapping", {
            BatchSize: 1,
            ScalingConfig: { MaximumConcurrency: 10 },
        });
    });

    it("honours explicit event source props", () => {
        const template = synthStack((stack) => {
            new SQSLambda(stack, "SQSFn", {
                sqsProps: { queueName: "widget-queue" },
                lambdaProps: { ...lambdaProps, timeout: Duration.seconds(60) },
                sqsEventSourceProps: { batchSize: 5, maxConcurrency: 25 },
            });
        });
        template.hasResourceProperties("AWS::Lambda::EventSourceMapping", {
            BatchSize: 5,
            ScalingConfig: { MaximumConcurrency: 25 },
        });
    });

    // Both fallbacks are now 900s, matching VanillaLambda's own default timeout, and the
    // resolved value is passed down to the function. The queue's visibility window can
    // therefore never be shorter than the function's timeout, which is the invariant this
    // construct exists to guarantee.
    it("gives the queue and the function the same 900s timeout when neither is specified", () => {
        const template = synthStack((stack) => {
            new SQSLambda(stack, "SQSFn", {
                sqsProps: { queueName: "widget-queue" },
                lambdaProps,
                sqsEventSourceProps: {},
            });
        });
        template.hasResourceProperties("AWS::SQS::Queue", {
            QueueName: "widget-queue",
            VisibilityTimeout: 900,
        });
        template.hasResourceProperties("AWS::Lambda::Function", { Timeout: 900 });
    });

    // The shape six production call sites in store-partner-server use: an explicit queue
    // visibility with the function timeout omitted. Both resolve to 900s, which is exactly
    // what these stacks already deploy — this case must stay a no-op.
    it("is unchanged when only the queue visibility is specified", () => {
        const template = synthStack((stack) => {
            new SQSLambda(stack, "SQSFn", {
                sqsProps: { queueName: "widget-queue", visibilityTimeout: Duration.seconds(900) },
                lambdaProps,
                sqsEventSourceProps: {},
            });
        });
        template.hasResourceProperties("AWS::SQS::Queue", {
            QueueName: "widget-queue",
            VisibilityTimeout: 900,
        });
        template.hasResourceProperties("AWS::Lambda::Function", { Timeout: 900 });
    });

    // The queue's visibility falls back to the RESOLVED function timeout rather than a
    // hardcoded 900s, so a short function gets a matching short visibility window and a
    // failed message is redelivered promptly instead of waiting 15 minutes.
    it("matches the queue visibility to a short function timeout", () => {
        const template = synthStack((stack) => {
            new SQSLambda(stack, "SQSFn", {
                sqsProps: { queueName: "widget-queue" },
                lambdaProps: { ...lambdaProps, timeout: Duration.seconds(120) },
                sqsEventSourceProps: {},
            });
        });
        template.hasResourceProperties("AWS::SQS::Queue", {
            QueueName: "widget-queue",
            VisibilityTimeout: 120,
        });
        template.hasResourceProperties("AWS::Lambda::Function", { Timeout: 120 });
    });

    // An explicit queue visibility longer than the function timeout is preserved, not
    // clamped down to it — the construct only ever raises the floor.
    it("preserves an explicit queue visibility longer than the function timeout", () => {
        const template = synthStack((stack) => {
            new SQSLambda(stack, "SQSFn", {
                sqsProps: { queueName: "widget-queue", visibilityTimeout: Duration.seconds(600) },
                lambdaProps: { ...lambdaProps, timeout: Duration.seconds(120) },
                sqsEventSourceProps: {},
            });
        });
        template.hasResourceProperties("AWS::SQS::Queue", {
            QueueName: "widget-queue",
            VisibilityTimeout: 600,
        });
        template.hasResourceProperties("AWS::Lambda::Function", { Timeout: 120 });
    });
});
