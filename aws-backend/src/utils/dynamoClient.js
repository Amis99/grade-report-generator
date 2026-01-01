/**
 * DynamoDB Client
 */
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, GetCommand, PutCommand, DeleteCommand, QueryCommand, ScanCommand, BatchWriteCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');

const client = new DynamoDBClient({ region: process.env.AWS_REGION || 'ap-northeast-2' });
const docClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
        removeUndefinedValues: true
    }
});

// Table names from environment
const Tables = {
    EXAMS: process.env.EXAMS_TABLE,
    QUESTIONS: process.env.QUESTIONS_TABLE,
    STUDENTS: process.env.STUDENTS_TABLE,
    ANSWERS: process.env.ANSWERS_TABLE,
    USERS: process.env.USERS_TABLE,
    REGISTRATIONS: process.env.REGISTRATIONS_TABLE
};

/**
 * Get item by PK and SK
 */
async function getItem(tableName, pk, sk) {
    const params = {
        TableName: tableName,
        Key: { PK: pk, SK: sk }
    };
    const result = await docClient.send(new GetCommand(params));
    return result.Item || null;
}

/**
 * Put item
 */
async function putItem(tableName, item) {
    const params = {
        TableName: tableName,
        Item: item
    };
    await docClient.send(new PutCommand(params));
    return item;
}

/**
 * Delete item
 */
async function deleteItem(tableName, pk, sk) {
    const params = {
        TableName: tableName,
        Key: { PK: pk, SK: sk }
    };
    await docClient.send(new DeleteCommand(params));
}

/**
 * Query items by PK
 */
async function queryByPK(tableName, pk, options = {}) {
    const params = {
        TableName: tableName,
        KeyConditionExpression: 'PK = :pk',
        ExpressionAttributeValues: { ':pk': pk },
        ...options
    };
    const result = await docClient.send(new QueryCommand(params));
    return result.Items || [];
}

/**
 * Query items by PK and SK prefix
 */
async function queryByPKAndSKPrefix(tableName, pk, skPrefix) {
    const params = {
        TableName: tableName,
        KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
        ExpressionAttributeValues: {
            ':pk': pk,
            ':skPrefix': skPrefix
        }
    };
    const result = await docClient.send(new QueryCommand(params));
    return result.Items || [];
}

/**
 * Query by GSI
 */
async function queryByIndex(tableName, indexName, keyCondition, expressionValues, options = {}) {
    const params = {
        TableName: tableName,
        IndexName: indexName,
        KeyConditionExpression: keyCondition,
        ExpressionAttributeValues: expressionValues,
        ...options
    };
    const result = await docClient.send(new QueryCommand(params));
    return result.Items || [];
}

/**
 * Scan table
 */
async function scanTable(tableName, filterExpression = null, expressionValues = null) {
    const params = {
        TableName: tableName
    };

    if (filterExpression) {
        params.FilterExpression = filterExpression;
        params.ExpressionAttributeValues = expressionValues;
    }

    const items = [];
    let lastEvaluatedKey = null;

    do {
        if (lastEvaluatedKey) {
            params.ExclusiveStartKey = lastEvaluatedKey;
        }

        const result = await docClient.send(new ScanCommand(params));
        items.push(...(result.Items || []));
        lastEvaluatedKey = result.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    return items;
}

/**
 * Batch write items
 */
async function batchWrite(tableName, items, operation = 'put') {
    const BATCH_SIZE = 25;

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
        const batch = items.slice(i, i + BATCH_SIZE);
        const requestItems = batch.map(item => {
            if (operation === 'put') {
                return { PutRequest: { Item: item } };
            } else if (operation === 'delete') {
                return { DeleteRequest: { Key: { PK: item.PK, SK: item.SK } } };
            }
        });

        const params = {
            RequestItems: {
                [tableName]: requestItems
            }
        };

        await docClient.send(new BatchWriteCommand(params));
    }
}

/**
 * Update item
 */
async function updateItem(tableName, pk, sk, updateExpression, expressionValues, expressionNames = null) {
    const params = {
        TableName: tableName,
        Key: { PK: pk, SK: sk },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionValues,
        ReturnValues: 'ALL_NEW'
    };

    if (expressionNames) {
        params.ExpressionAttributeNames = expressionNames;
    }

    const result = await docClient.send(new UpdateCommand(params));
    return result.Attributes;
}

/**
 * Generate unique ID
 */
function generateId() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
}

module.exports = {
    docClient,
    Tables,
    getItem,
    putItem,
    deleteItem,
    queryByPK,
    queryByPKAndSKPrefix,
    queryByIndex,
    scanTable,
    batchWrite,
    updateItem,
    generateId
};
