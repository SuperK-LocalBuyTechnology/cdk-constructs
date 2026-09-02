import { EventProcessingLambda } from "../lib/event-processing-lambda";
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
