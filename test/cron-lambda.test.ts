import { Match } from "aws-cdk-lib/assertions";
import { CronLambda, ScheduleState } from "../lib/cron-lambda";
import { FIXTURE_ENTRY, synthStack } from "./helpers/synth";

const lambdaProps = {
    functionName: "test-fn",
    handler: "handler",
    entry: FIXTURE_ENTRY,
};

describe("CronLambda", () => {
    it("creates a schedule, a function, and an invoker role", () => {
        const template = synthStack((stack) => {
            new CronLambda(stack, "Cron", {
                lambdaProps,
                scheduleProps: { scheduleExpression: "cron(0 3 * * ? *)" },
            });
        });
        template.resourceCountIs("AWS::Scheduler::Schedule", 1);
        template.resourceCountIs("AWS::Lambda::Function", 1);
        template.hasResourceProperties("AWS::IAM::Role", {
            AssumeRolePolicyDocument: {
                Statement: [
                    {
                        Action: "sts:AssumeRole",
                        Effect: "Allow",
                        Principal: { Service: "scheduler.amazonaws.com" },
                    },
                ],
                Version: "2012-10-17",
            },
        });
    });

    it("defaults the schedule timezone to Asia/Calcutta and state to ENABLED", () => {
        const template = synthStack((stack) => {
            new CronLambda(stack, "Cron", {
                lambdaProps,
                scheduleProps: { scheduleExpression: "cron(0 3 * * ? *)" },
            });
        });
        template.hasResourceProperties("AWS::Scheduler::Schedule", {
            ScheduleExpression: "cron(0 3 * * ? *)",
            ScheduleExpressionTimezone: "Asia/Calcutta",
            State: "ENABLED",
            FlexibleTimeWindow: { Mode: "OFF" },
        });
    });

    it("honours an explicit timezone and DISABLED state", () => {
        const template = synthStack((stack) => {
            new CronLambda(stack, "Cron", {
                lambdaProps,
                scheduleProps: {
                    scheduleExpression: "rate(1 hour)",
                    scheduleExpressionTimezone: "UTC",
                    state: ScheduleState.DISABLED,
                },
            });
        });
        template.hasResourceProperties("AWS::Scheduler::Schedule", {
            ScheduleExpression: "rate(1 hour)",
            ScheduleExpressionTimezone: "UTC",
            State: "DISABLED",
        });
    });

    it("points the schedule's target at its own function", () => {
        const template = synthStack((stack) => {
            new CronLambda(stack, "Cron", {
                lambdaProps,
                scheduleProps: { scheduleExpression: "rate(1 hour)" },
            });
        });
        const functions = Object.keys(template.findResources("AWS::Lambda::Function"));
        expect(functions).toHaveLength(1);
        template.hasResourceProperties("AWS::Scheduler::Schedule", {
            Target: Match.objectLike({
                Arn: Match.objectLike({ "Fn::GetAtt": Match.arrayWith([functions[0]]) }),
            }),
        });
    });
});
