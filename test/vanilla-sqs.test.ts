import { Duration } from "aws-cdk-lib";
import { Match } from "aws-cdk-lib/assertions";
import { VanillaSQS } from "../lib/vanilla-sqs";
import { synthStack } from "./helpers/synth";

describe("VanillaSQS", () => {
    it("creates a queue and a dead letter queue", () => {
        const template = synthStack((stack) => {
            new VanillaSQS(stack, "Q", { queueName: "widget-queue" });
        });
        template.resourceCountIs("AWS::SQS::Queue", 2);
        template.hasResourceProperties("AWS::SQS::Queue", { QueueName: "widget-queue" });
        template.hasResourceProperties("AWS::SQS::Queue", { QueueName: "widget-queueDLQ" });
    });

    it("wires the DLQ with a maxReceiveCount of 3 by default", () => {
        const template = synthStack((stack) => {
            new VanillaSQS(stack, "Q", { queueName: "widget-queue" });
        });
        template.hasResourceProperties("AWS::SQS::Queue", {
            QueueName: "widget-queue",
            RedrivePolicy: Match.objectLike({ maxReceiveCount: 3 }),
        });
    });

    it("honours a custom maxReceiveCount", () => {
        const template = synthStack((stack) => {
            new VanillaSQS(stack, "Q", { queueName: "widget-queue", maxReceiveCount: 7 });
        });
        template.hasResourceProperties("AWS::SQS::Queue", {
            QueueName: "widget-queue",
            RedrivePolicy: Match.objectLike({ maxReceiveCount: 7 }),
        });
    });

    it("defaults retention to 14 days and visibility to 30 seconds", () => {
        const template = synthStack((stack) => {
            new VanillaSQS(stack, "Q", { queueName: "widget-queue" });
        });
        template.hasResourceProperties("AWS::SQS::Queue", {
            QueueName: "widget-queue",
            MessageRetentionPeriod: 1209600,
            VisibilityTimeout: 30,
        });
    });

    it("appends .fifo and enables content-based deduplication for FIFO queues", () => {
        const template = synthStack((stack) => {
            new VanillaSQS(stack, "Q", { queueName: "widget-queue", fifo: true });
        });
        template.hasResourceProperties("AWS::SQS::Queue", {
            QueueName: "widget-queue.fifo",
            FifoQueue: true,
            ContentBasedDeduplication: true,
        });
        template.hasResourceProperties("AWS::SQS::Queue", {
            QueueName: "widget-queueDLQ.fifo",
            FifoQueue: true,
        });
    });

    it("applies a delivery delay when given", () => {
        const template = synthStack((stack) => {
            new VanillaSQS(stack, "Q", {
                queueName: "widget-queue",
                deliveryDelay: Duration.seconds(60),
            });
        });
        template.hasResourceProperties("AWS::SQS::Queue", {
            QueueName: "widget-queue",
            DelaySeconds: 60,
        });
    });
});
