import { Construct } from "constructs";
import { VanillaLambda, VanillaLambdaProps } from "./vanilla-lambda";
import { CfnSchedule } from "aws-cdk-lib/aws-scheduler";
import { Role, ServicePrincipal, ManagedPolicy } from "aws-cdk-lib/aws-iam";

export enum ScheduleState {
    ENABLED = "ENABLED",
    DISABLED = "DISABLED",
}

export type CronLambdaProps = {
    lambdaProps: VanillaLambdaProps;
    scheduleProps: {
        scheduleExpression: string;
        scheduleExpressionTimezone?: string;
        state?: ScheduleState; // default ENABLED — existing CronLambdas unaffected
    };
};

/**
 *  Cron Lambda is a lambda function that runs on a schedule
 *
 * Defaults:
 * - scheduleExpressionTimezone: Asia/Calcutta
 *
 * Resources:
 * - Lambda: VanillaLambda
 * - Schedule: CfnSchedule
 */
export class CronLambda extends Construct {
    lambda: VanillaLambda;
    schedule: CfnSchedule;
    constructor(scope: Construct, id: string, props: CronLambdaProps) {
        super(scope, id);
        this.lambda = new VanillaLambda(this, "Handler", props.lambdaProps);

        const role = new Role(this, "Role", {
            managedPolicies: [ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaRole")],
            assumedBy: new ServicePrincipal("scheduler.amazonaws.com"),
        });

        this.schedule = new CfnSchedule(this, "Schedule", {
            flexibleTimeWindow: {
                mode: "OFF",
            },
            scheduleExpression: props.scheduleProps.scheduleExpression,
            scheduleExpressionTimezone: props.scheduleProps.scheduleExpressionTimezone ?? "Asia/Calcutta",
            state: props.scheduleProps.state ?? ScheduleState.ENABLED,
            target: {
                arn: this.lambda.functionArn,
                roleArn: role.roleArn,
            },
        });
    }
}
