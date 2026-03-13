
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import dotenv from 'dotenv';
dotenv.config();

async function testS3() {
    console.log("--- S3 CONNECTION TEST ---");
    const endpoint = process.env.SUPABASE_S3_ENDPOINT;
    const region = process.env.SUPABASE_S3_REGION;
    const accessKey = process.env.SUPABASE_S3_ACCESS_KEY;
    const secretKey = process.env.SUPABASE_S3_SECRET_KEY;
    const bucket = process.env.SUPABASE_S3_BUCKET;

    console.log(`Endpoint: ${endpoint}`);
    console.log(`Region: ${region}`);
    console.log(`Bucket: ${bucket}`);

    const client = new S3Client({
        forcePathStyle: true,
        region: region,
        endpoint: endpoint,
        credentials: {
            accessKeyId: accessKey!,
            secretAccessKey: secretKey!,
        },
    });

    try {
        console.log("Attempting to upload test file...");
        const command = new PutObjectCommand({
            Bucket: bucket,
            Key: "test_connection.txt",
            Body: "Connection test from Ping backend at " + new Date().toISOString(),
            ContentType: "text/plain",
        });

        await client.send(command);
        console.log("✅ SUCCESS: File uploaded successfully!");
    } catch (err) {
        console.error("❌ FAILED: S3 upload failed!");
        console.error(err);
    }
}

testS3();
