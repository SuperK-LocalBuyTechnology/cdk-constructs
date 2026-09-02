import { Match } from "aws-cdk-lib/assertions";
import { AttributeType } from "aws-cdk-lib/aws-dynamodb";
import { VanillaDDBTable } from "../lib/vanilla-ddb-table";
import { synthStack } from "./helpers/synth";

const partitionKey = { name: "pk", type: AttributeType.STRING };

describe("VanillaDDBTable", () => {
    it("applies the fixed table configuration", () => {
        const template = synthStack((stack) => {
            new VanillaDDBTable(stack, "Table", { tableName: "widget-table", partitionKey });
        });
        template.hasResourceProperties("AWS::DynamoDB::Table", {
            TableName: "widget-table",
            BillingMode: "PAY_PER_REQUEST",
            DeletionProtectionEnabled: true,
            StreamSpecification: { StreamViewType: "NEW_AND_OLD_IMAGES" },
            KeySchema: [{ AttributeName: "pk", KeyType: "HASH" }],
        });
    });

    it("exports the stream ARN as a CloudFormation output by default", () => {
        const template = synthStack((stack) => {
            new VanillaDDBTable(stack, "Table", { tableName: "widget-table", partitionKey });
        });
        template.hasOutput("*", {
            Export: { Name: "widget-tableSTREAM" },
        });
    });

    it("suppresses the stream ARN output when disableStreamArnOutput is set", () => {
        const template = synthStack((stack) => {
            new VanillaDDBTable(stack, "Table", {
                tableName: "widget-table",
                partitionKey,
                disableStreamArnOutput: true,
            });
        });
        expect(Object.keys(template.findOutputs("*"))).toHaveLength(0);
    });

    it("adds a sort key when provided", () => {
        const template = synthStack((stack) => {
            new VanillaDDBTable(stack, "Table", {
                tableName: "widget-table",
                partitionKey,
                sortKey: { name: "sk", type: AttributeType.STRING },
            });
        });
        template.hasResourceProperties("AWS::DynamoDB::Table", {
            KeySchema: [
                { AttributeName: "pk", KeyType: "HASH" },
                { AttributeName: "sk", KeyType: "RANGE" },
            ],
        });
    });

    it("adds global and local secondary indexes", () => {
        const template = synthStack((stack) => {
            new VanillaDDBTable(stack, "Table", {
                tableName: "widget-table",
                partitionKey,
                sortKey: { name: "sk", type: AttributeType.STRING },
                globalSecondaryIndexes: [
                    { indexName: "CategoryIndex", partitionKey: { name: "category", type: AttributeType.STRING } },
                ],
                localSecondaryIndexes: [
                    { indexName: "NameIndex", sortKey: { name: "name", type: AttributeType.STRING } },
                ],
            });
        });
        template.hasResourceProperties("AWS::DynamoDB::Table", {
            GlobalSecondaryIndexes: Match.arrayWith([Match.objectLike({ IndexName: "CategoryIndex" })]),
            LocalSecondaryIndexes: Match.arrayWith([Match.objectLike({ IndexName: "NameIndex" })]),
        });
    });

    it("enables time-to-live when an attribute is given", () => {
        const template = synthStack((stack) => {
            new VanillaDDBTable(stack, "Table", {
                tableName: "widget-table",
                partitionKey,
                timeToLiveAttribute: "expiresAt",
            });
        });
        template.hasResourceProperties("AWS::DynamoDB::Table", {
            TimeToLiveSpecification: { AttributeName: "expiresAt", Enabled: true },
        });
    });
});
