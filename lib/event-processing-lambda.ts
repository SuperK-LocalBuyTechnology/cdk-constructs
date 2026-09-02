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
 * - Lambda: VanillaLambda
 * - Rule: Rule
 */
export class EventProcessingLambda extends Construct {
    eventProcessingLambda: VanillaLambda;
    rule: Rule;
    constructor(scope: Construct, id: string, props: EventProcessingLambdaProps) {
        super(scope, id);
        this.eventProcessingLambda = new VanillaLambda(this, "Handler", props.lambdaProps);

        this.rule = new Rule(this, "Rule", props.ruleProps);

        this.rule.addTarget(new LambdaFunction(this.eventProcessingLambda));
    }
}
