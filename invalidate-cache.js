const { CloudFrontClient, CreateInvalidationCommand, ListDistributionsCommand } = require('@aws-sdk/client-cloudfront');

const client = new CloudFrontClient({ region: 'ap-northeast-2' });

async function findDistributionId() {
    const command = new ListDistributionsCommand({});
    const response = await client.send(command);

    // test-report-frontend-googerfarm 버킷과 연결된 배포 찾기
    for (const dist of response.DistributionList.Items || []) {
        for (const origin of dist.Origins.Items || []) {
            if (origin.DomainName.includes('test-report-frontend-googerfarm')) {
                return dist.Id;
            }
        }
        // 또는 도메인으로 찾기
        if (dist.Aliases && dist.Aliases.Items) {
            for (const alias of dist.Aliases.Items) {
                if (alias.includes('test.hak1ad.kr')) {
                    return dist.Id;
                }
            }
        }
    }
    return null;
}

async function invalidateCache(distributionId) {
    const command = new CreateInvalidationCommand({
        DistributionId: distributionId,
        InvalidationBatch: {
            CallerReference: `invalidation-${Date.now()}`,
            Paths: {
                Quantity: 1,
                Items: ['/*']
            }
        }
    });

    const response = await client.send(command);
    return response.Invalidation;
}

async function main() {
    console.log('Finding CloudFront distribution...');

    const distributionId = await findDistributionId();

    if (!distributionId) {
        console.log('Distribution not found. Listing all distributions:');
        const cmd = new ListDistributionsCommand({});
        const res = await client.send(cmd);
        for (const dist of res.DistributionList.Items || []) {
            console.log(`- ${dist.Id}: ${dist.DomainName}`);
            if (dist.Aliases && dist.Aliases.Items) {
                console.log(`  Aliases: ${dist.Aliases.Items.join(', ')}`);
            }
            for (const origin of dist.Origins.Items || []) {
                console.log(`  Origin: ${origin.DomainName}`);
            }
        }
        return;
    }

    console.log(`Found distribution: ${distributionId}`);
    console.log('Creating cache invalidation...');

    const invalidation = await invalidateCache(distributionId);
    console.log(`Invalidation created: ${invalidation.Id}`);
    console.log('Status:', invalidation.Status);
    console.log('Cache will be invalidated in 1-2 minutes.');
}

main().catch(err => {
    console.error('Error:', err.message);
});
