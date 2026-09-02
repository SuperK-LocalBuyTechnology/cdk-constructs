import { Construct } from "constructs";
import { VanillaSQS, VanillaSQSProps } from "./vanilla-sqs";
import { VanillaLambda, VanillaLambdaProps } from "./vanilla-lambda";
import { SqsEventSource, SqsEventSourceProps } from "aws-cdk-lib/aws-lambda-event-sources";
import { Queue } from "aws-cdk-lib/aws-sqs";
import { Duration } from "aws-cdk-lib";

/**
 * Properties for the SQSLambda construct.
 *
 * @remarks
 * This interface contains the properties that can be passed to the
 * SQSLambda construct. The properties are divided into three categories,
 * one for the SQS, one for the Lambda, and one for the SqsEventSource.
 */
export interface SQSLambdaProps {
    /**
     * Properties for the SQS.
     */
    readonly sqsProps: VanillaSQSProps;

    /**
     * Properties for the Lambda.
     */
    readonly lambdaProps: VanillaLambdaProps;

    /**
     * Properties for the SqsEventSource.
     *
     * @default
     * { batchSize: 1, maxConcurrency: 10 }
     */
    readonly sqsEventSourceProps: SqsEventSourceProps;
}
/**
 * Construct that creates a vanilla SQS and a vanilla Lambda that is
 * triggered by the SQS.
 *
 * This construct is useful when you want an SQS and a Lambda that is
 * triggered by the SQS, with all the defaults of the VanillaSQS and
 * VanillaLambda constructs.
 */
export class SQSLambda extends Construct {
    readonly sqs: Queue;
    readonly lambda: VanillaLambda;

    constructor(scope: Construct, id: string, props: SQSLambdaProps) {
        super(scope, id);

        // Ensure SQS visibility timeout is at least as long as Lambda timeout
        const lambdaTimeout = props.lambdaProps.timeout ?? Duration.seconds(30);
        const sqsProps = {
            ...props.sqsProps,
            visibilityTimeout: Duration.seconds(
                Math.max(
                    lambdaTimeout.toSeconds(),
                    (props.sqsProps.visibilityTimeout ?? Duration.seconds(30)).toSeconds()
                )
            ),
        };

        const vanillaSQS = new VanillaSQS(this, "SQS", sqsProps);
        this.sqs = vanillaSQS.sqs;

        this.lambda = new VanillaLambda(this, "Handler", props.lambdaProps);

        this.lambda.addEventSource(
            new SqsEventSource(vanillaSQS.sqs, {
                ...props.sqsEventSourceProps,
                batchSize: props.sqsEventSourceProps.batchSize ?? 1,
                maxConcurrency: props.sqsEventSourceProps.maxConcurrency ?? 10,
            })
        );
    }
}
