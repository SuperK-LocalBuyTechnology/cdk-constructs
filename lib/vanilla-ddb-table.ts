import { CfnOutput } from "aws-cdk-lib";
import {
    AttributeType,
    BillingMode,
    GlobalSecondaryIndexProps,
    LocalSecondaryIndexProps,
    StreamViewType,
    Table,
    TableProps,
} from "aws-cdk-lib/aws-dynamodb";
import { Construct } from "constructs";

/**
 * Properties for {@link VanillaDDBTable}
 */
export interface VanillaDDBTableProps {
    /**
     * The name of the DynamoDB table.
     */
    readonly tableName: string;

    /**
     * The partition key of the table.
     */
    readonly partitionKey: {
        name: string;
        type: AttributeType;
    };

    /**
     * Optional sort key for the table.
     */
    readonly sortKey?: {
        name: string;
        type: AttributeType;
    };

    /**
     * Optional Global Secondary Indexes for the table.
     */
    readonly globalSecondaryIndexes?: GlobalSecondaryIndexProps[];

    /**
     * Optional Local Secondary Indexes for the table.
     */
    readonly localSecondaryIndexes?: LocalSecondaryIndexProps[];

    /**
     * Optional flag to disable the stream ARN output.
     * @default false - Stream ARN output will be created
     */
    readonly disableStreamArnOutput?: boolean;

    /**
     * Optional name of the attribute holding the TTL (epoch-seconds) value.
     * When set, DynamoDB time-to-live is enabled on that attribute and items
     * are auto-deleted once it passes. Leave unset to disable TTL.
     */
    readonly timeToLiveAttribute?: string;
}

/**
 * A vanilla DynamoDB table with stream enabled and pay-per-request billing mode.
 *
 * This construct creates a DynamoDB table with the following fixed configurations:
 * - Deletion Protection enabled (prevents accidental deletion)
 * - Stream enabled with NEW_AND_OLD_IMAGES
 * - PAY_PER_REQUEST billing mode
 * - Creates a CloudFormation output for the stream ARN by default
 *
 * @example
 * ```typescript
 * // Basic table with just a partition key
 * const userTable = new VanillaDDBTable(this, 'UserTableConstruct', {
 *   tableName: 'user-table',
 *   partitionKey: {
 *     name: 'userId',
 *     type: AttributeType.STRING
 *   }
 * });
 *
 * // Table with partition key and sort key
 * const orderTable = new VanillaDDBTable(this, 'OrderTableConstruct', {
 *   tableName: 'order-table',
 *   partitionKey: {
 *     name: 'userId',
 *     type: AttributeType.STRING
 *   },
 *   sortKey: {
 *     name: 'orderId',
 *     type: AttributeType.STRING
 *   }
 * });
 *
 * // Table with GSI and LSI
 * const productTable = new VanillaDDBTable(this, 'ProductTableConstruct', {
 *   tableName: 'product-table',
 *   partitionKey: {
 *     name: 'productId',
 *     type: AttributeType.STRING
 *   },
 *   globalSecondaryIndexes: [{
 *     indexName: 'CategoryIndex',
 *     partitionKey: {
 *       name: 'category',
 *       type: AttributeType.STRING
 *     },
 *     sortKey: {
 *       name: 'price',
 *       type: AttributeType.NUMBER
 *     }
 *   }],
 *   localSecondaryIndexes: [{
 *     indexName: 'NameIndex',
 *     sortKey: {
 *       name: 'productName',
 *       type: AttributeType.STRING
 *     }
 *   }]
 * });
 * ```
 */
export class VanillaDDBTable extends Construct {
    public readonly table: Table;

    constructor(scope: Construct, id: string, props: VanillaDDBTableProps) {
        super(scope, id);

        const baseTableProps: TableProps = {
            tableName: props.tableName,
            partitionKey: props.partitionKey,
            sortKey: props.sortKey,
            stream: StreamViewType.NEW_AND_OLD_IMAGES,
            billingMode: BillingMode.PAY_PER_REQUEST,
            deletionProtection: true,
            timeToLiveAttribute: props.timeToLiveAttribute,
        };

        this.table = new Table(this, props.tableName, baseTableProps);

        // Add Global Secondary Indexes if provided
        props.globalSecondaryIndexes?.forEach((gsi) => {
            this.table.addGlobalSecondaryIndex({
                ...gsi,
                indexName: gsi.indexName,
            });
        });

        // Add Local Secondary Indexes if provided
        props.localSecondaryIndexes?.forEach((lsi) => {
            this.table.addLocalSecondaryIndex({
                ...lsi,
                indexName: lsi.indexName,
            });
        });

        // Create stream ARN output unless explicitly disabled
        if (!props.disableStreamArnOutput) {
            new CfnOutput(this, `${props.tableName}STREAM`, {
                exportName: `${props.tableName}STREAM`,
                value: this.table.tableStreamArn!,
            });
        }
    }
}
