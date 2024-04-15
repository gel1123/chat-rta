/// <reference path="./.sst/platform/config.d.ts" />
import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

export default $config({
  app(input) {
    return {
      name: "chat-rta",
      removal: input?.stage === "production" ? "retain" : "remove",
      home: "aws",
    };
  },
  async run() {
    // https://ion.sst.dev/docs/providers/#functions
    const current = await aws.getCallerIdentity({});
    const accountId = current.accountId;
    const region = (await aws.getRegion({})).name;

    // ---- DynamoDB ----
    const table = new sst.aws.Dynamo("RtaChatTable", {
      fields: {
        pk: "string",
        sk: "string",
      },
      primaryIndex: { hashKey: "pk", rangeKey: "sk" },
      stream: "new-image",
    });

    // ---- WebSocket Handler ----
    const wsHandler = new sst.aws.Function("RtaChatWsHandler", {
      handler: "src/ws.handler",
      link: [table],
    });

    // ---- WebSocket API ----
    const wsApi = new aws.apigatewayv2.Api("RtaChatWsApi", {
      protocolType: "WEBSOCKET",
      routeSelectionExpression: "$request.body.action",
    });
    const connectIntegration = new aws.apigatewayv2.Integration(
      "RtaChatConnectIntegration",
      {
        apiId: wsApi.id,
        integrationType: "AWS_PROXY",
        integrationUri: wsHandler.arn,
        integrationMethod: "POST",
        payloadFormatVersion: "1.0",
      }
    );
    const connectRoute = new aws.apigatewayv2.Route("RtaChatConnectRoute", {
      apiId: wsApi.id,
      routeKey: "$connect",
      authorizationType: "NONE",
      target: pulumi.interpolate`integrations/${connectIntegration.id}`,
    });
    const disconnectIntegration = new aws.apigatewayv2.Integration(
      "RtaChatDisconnectIntegration",
      {
        apiId: wsApi.id,
        integrationType: "AWS_PROXY",
        integrationUri: wsHandler.arn,
        integrationMethod: "POST",
        payloadFormatVersion: "1.0",
      }
    );
    const disconnectRoute = new aws.apigatewayv2.Route(
      "RtaChatDisconnectRoute",
      {
        apiId: wsApi.id,
        routeKey: "$disconnect",
        authorizationType: "NONE",
        target: pulumi.interpolate`integrations/${disconnectIntegration.id}`,
      }
    );
    const stage = new aws.apigatewayv2.Stage("RtaChatWsApiStage", {
      apiId: wsApi.id,
      name: $app.stage,
      autoDeploy: true,
    });
    const chatInvokePermission = new aws.lambda.Permission(
      "RtaChatChatInvokePermission",
      {
        action: "lambda:InvokeFunction",
        function: wsHandler.arn,
        principal: "apigateway.amazonaws.com",
        sourceArn: pulumi.interpolate`${wsApi.executionArn}/*/*`,
      }
    );

    // ---- DynamoDB Streams Handler ----
    const subscriber = table.subscribe({
      handler: "src/trigger.handler",
      link: [table],
      environment: {
        WS_API_URL: wsApi.apiEndpoint,
        STAGE: $app.stage,
      },
      permissions: [
        {
          actions: ["execute-api:ManageConnections"],
          resources: [
            pulumi.interpolate`arn:aws:execute-api:${region}:${accountId}:${wsApi.id}/${$app.stage}/*`,
          ],
        },
      ],
    });

    // ---- WebSite (Astro) ----
    new sst.aws.Astro("RtaChatWeb", {
      link: [table],
      environment: {
        WS_API_URL: wsApi.apiEndpoint,
        STAGE: $app.stage,
      },
    });
  },
});
