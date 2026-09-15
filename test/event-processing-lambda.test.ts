import { EventProcessingLambda } from "../lib/event-processing-lambda";
import { Match } from "aws-cdk-lib/assertions";
import { FIXTURE_ENTRY, synthStack } from "./helpers/synth";

const lambdaProps = {
    functionName: "test-fn",
    handler: "handler",
    entry: FIXTURE_ENTRY,
};

describe("EventProcessingLambda", () => {
    it("creates a rule targeting the function", () => {
        const template = synthStack((stack) => {
            new EventProcessingLambda(stack, "Evt", {
                lambdaProps,
                ruleProps: {
                    eventPattern: { source: ["widget.service"] },
                },
            });
        });
        template.resourceCountIs("AWS::Events::Rule", 1);
        template.resourceCountIs("AWS::Lambda::Function", 1);
        template.hasResourceProperties("AWS::Events::Rule", {
            EventPattern: { source: ["widget.service"] },
        });
    });

    it("creates a dead letter queue for the function by default", () => {
        const template = synthStack((stack) => {
            new EventProcessingLambda(stack, "Evt", {
                lambdaProps,
                ruleProps: { eventPattern: { source: ["widget.service"] } },
            });
        });
        template.resourceCountIs("AWS::SQS::Queue", 1);
        template.hasResourceProperties("AWS::Lambda::Function", {
            DeadLetterConfig: { TargetArn: { "Fn::GetAtt": [Match.anyValue(), "Arn"] } },
        });
    });

    it("omits the dead letter queue when the consumer opts out", () => {
        const template = synthStack((stack) => {
            new EventProcessingLambda(stack, "Evt", {
                lambdaProps: { ...lambdaProps, deadLetterQueueEnabled: false },
                ruleProps: { eventPattern: { source: ["widget.service"] } },
            });
        });
        template.resourceCountIs("AWS::SQS::Queue", 0);
        template.hasResource("AWS::Lambda::Function", {
            Properties: Match.not(Match.objectLike({ DeadLetterConfig: Match.anyValue() })),
        });
    });

    it("grants EventBridge permission to invoke the function", () => {
        const template = synthStack((stack) => {
            new EventProcessingLambda(stack, "Evt", {
                lambdaProps,
                ruleProps: { eventPattern: { source: ["widget.service"] } },
            });
        });
        template.hasResourceProperties("AWS::Lambda::Permission", {
            Action: "lambda:InvokeFunction",
            Principal: "events.amazonaws.com",
        });
    });
});
