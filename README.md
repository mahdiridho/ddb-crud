# Anti-Pattern Architecture — Bad Approach!?
Mastering Credential Security: Stay One Step Ahead
Author: Mahdi Ridho

## DDB CRUD
A fun project designed to explore Serverless-based CRUD architecture using AWS DynamoDB. This project introduces an anti-pattern architecture that establishes a direct connection between the browser and AWS DynamoDB. Step-by-step, we will discuss the pros and cons of this approach and how to manage the potential issues associated with it.

## Prerequisite
- AWS Account
- Backend Stack
- Frontend Stack
- Nodejs
- NPM

### Backend Stack
Create a CloudFormation stack using the provided stack.yaml template located in the backend folder. This template will deploy services such as the Cognito User Pool, Cognito Identity Pool, DynamoDB, and set up the necessary IAM Role Policies. In this demo, we define the stack prefix as "NoobApp," but you can customize the prefix as needed.

### Frontend Stack
- Install the dependencies:

```
npm i
```

- Update the config.json file according to your backend definitions:

```
{
    "poolname": "<COGNITO_USER_POOL_NAME>",
    "poolid": "<COGNITO_USER_POOL_ID>",
    "region": "<AWS_REGION>",
    "clientId": "<COGNITO_USER_POOL_CLIENT_ID>",
    "identitypool": "<COGNITO_IDENTITY_POOL_ID>",
    "ddbTable": "<DYNAMODB_TABLE_NAME>"
}
```

## Run
Run the demo:

```
npm run start
```
