import { Rule, RuleProps } from "aws-cdk-lib/aws-events";
import { LambdaFunction } from "aws-cdk-lib/aws-events-targets";
import { Construct } from "constructs";
import { VanillaLambda, VanillaLambdaProps } from "./vanilla-lambda";

export type EventProcessingLambdaProps = {
    lambdaProps: VanillaLambdaProps;
    ruleProps: RuleProps;
};

/**
 * An event processing lambda that processes events from a rule
 *
 * Resources:
 * - Lambda: VanillaLambda (with a dead letter queue unless opted out)
 * - Rule: Rule
 */
export class EventProcessingLambda extends Construct {
    eventProcessingLambda: VanillaLambda;
    rule: Rule;
    constructor(scope: Construct, id: string, props: EventProcessingLambdaProps) {
        super(scope, id);
        // Event processing lambdas are invoked asynchronously, so a handler that
        // throws is retried twice by Lambda and then dropped. Default the function
        // DLQ on so those events stay redrivable; a consumer opts out with
        // `deadLetterQueueEnabled: false`.
        //
        // This deliberately lives here rather than in VanillaLambda: a function DLQ
        // only applies to async invocations, so defaulting it on the base construct
        // would attach a meaningless queue to every synchronously-invoked API lambda.
        //
        // Note for anyone redriving from this queue: the message body is the raw
        // event payload. Error details arrive as SQS message attributes
        // (RequestID, ErrorCode, ErrorMessage), not in the body.
        this.eventProcessingLambda = new VanillaLambda(this, "Handler", {
            ...props.lambdaProps,
            deadLetterQueueEnabled: props.lambdaProps.deadLetterQueueEnabled ?? true,
        });

        this.rule = new Rule(this, "Rule", props.ruleProps);

        this.rule.addTarget(new LambdaFunction(this.eventProcessingLambda));
    }
}
