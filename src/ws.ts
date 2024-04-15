import { ConnectionEntity } from "@/entities/connection";
import type { APIGatewayProxyWebsocketHandlerV2 } from "aws-lambda";

export const handler: APIGatewayProxyWebsocketHandlerV2 = async (event) => {
  const connectionId = event.requestContext.connectionId;
  const routeKey = event.requestContext.routeKey;

  switch (routeKey) {
    // 接続ルート
    case "$connect":
      await ConnectionEntity.create({ connectionId }).go();
      return {
        statusCode: 200,
        body: "Connected",
      };
    // 切断ルート
    case "$disconnect":
      await ConnectionEntity.delete({ connectionId }).go();
      return {
        statusCode: 200,
        body: "Disconnected",
      };
  }
  // その他のルートキーはエラー
  return {
    statusCode: 400,
    body: "Bad Request",
  };
};
