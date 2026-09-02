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

    // Characterization of a KNOWN latent asymmetry — tracked separately, do not change.
    // When lambdaProps.timeout is omitted, SQSLambda's fallback is 30s while the Lambda
    // itself inherits VanillaLambda's 900s default.
    it("uses a 30s visibility floor when neither timeout is specified (known asymmetry)", () => {
        const template = synthStack((stack) => {
            new SQSLambda(stack, "SQSFn", {
                sqsProps: { queueName: "widget-queue" },
                lambdaProps,
                sqsEventSourceProps: {},
            });
        });
        template.hasResourceProperties("AWS::SQS::Queue", {
            QueueName: "widget-queue",
            VisibilityTimeout: 30,
        });
        template.hasResourceProperties("AWS::Lambda::Function", { Timeout: 900 });
    });
});
