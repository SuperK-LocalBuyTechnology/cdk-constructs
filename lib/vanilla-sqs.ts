import { Duration } from "aws-cdk-lib";
import { Queue, QueueProps } from "aws-cdk-lib/aws-sqs";
import { Construct } from "constructs";

/**
 * Properties for {@link VanillaSQS}
 */
export interface VanillaSQSProps {
    /**
     * The name of the SQS queue.
     *
     * If the queue is a FIFO queue the suffix ".fifo" will be appended automatically.
     */
    readonly queueName: string;

    /**
     * The maximum number of times a message can be received by multiple consumers before it is moved to the dead letter queue.
     *
     * Defaults to 3.
     */
    readonly maxReceiveCount?: number;

    /**
     * Whether the queue is a FIFO queue.
     *
     * Defaults to false.
     */
    readonly fifo?: boolean;

    /**
     * The amount of time that the delivery of all messages in the queue is delayed.
     *
     * Defaults to no delay.
     */
    readonly deliveryDelay?: Duration;

    /**
     * The length of time that Amazon SQS retains a message.
     *
     * Defaults to 14 days.
     */
    readonly retentionPeriod?: Duration;

    /**
     * The length of time that a message remains invisible after being received.
     *
     * Defaults to 30 seconds.
     */
    readonly visibilityTimeout?: Duration;

    /**
     * Whether the content based deduplication is enabled.
     *
     * Defaults to true.
     */
    readonly contentBasedDeduplication?: boolean;
}

/**
 * A vanilla SQS queue with dead letter queue and some common configurations.
 *
 * Use this construct to create an SQS queue and its corresponding DLQ.
 */
export class VanillaSQS extends Construct {
    sqs: Queue;
    constructor(scope: Construct, id: string, props: VanillaSQSProps) {
        super(scope, id);

        const baseDlqProps: QueueProps = {
            queueName: `${props.queueName}DLQ${props.fifo ? ".fifo" : ""}`,
            retentionPeriod: Duration.days(14),
            fifo: props.fifo ?? false,
            visibilityTimeout: props.visibilityTimeout ?? Duration.seconds(30),
        };

        const dlqProps: QueueProps = props.fifo
            ? {
                  ...baseDlqProps,
                  contentBasedDeduplication: props.contentBasedDeduplication ?? true,
              }
            : baseDlqProps;

        const dlq = new Queue(this, "DLQ", dlqProps);

        const baseQueueProps: QueueProps = {
            queueName: `${props.queueName}${props.fifo ? ".fifo" : ""}`,
            fifo: props.fifo ?? false,
            retentionPeriod: props.retentionPeriod ?? Duration.days(14),
            deadLetterQueue: {
                queue: dlq,
                maxReceiveCount: props.maxReceiveCount ?? 3,
            },
            deliveryDelay: props.deliveryDelay,
            visibilityTimeout: props.visibilityTimeout ?? Duration.seconds(30),
        };

        const queueProps: QueueProps = props.fifo
            ? {
                  ...baseQueueProps,
                  contentBasedDeduplication: props.contentBasedDeduplication ?? true,
              }
            : baseQueueProps;

        this.sqs = new Queue(this, "QUEUE", queueProps);
    }
}
