import { ApiGatewayManagementApi } from "@aws-sdk/client-apigatewaymanagementapi";
import type { DynamoDBBatchResponse, DynamoDBStreamHandler } from "aws-lambda";
import { ConnectionEntity } from "@/entities/connection";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import type { AttributeValue } from "@aws-sdk/client-dynamodb";
import { MessageEntity, type MessageEntityType } from "@/entities/message";

export const handler: DynamoDBStreamHandler = async (event) => {
  // Streamsが流してきたデータのうち、メッセージエンティティのみを抽出
  const messages = event.Records.filter((record) => record.dynamodb?.NewImage)
    .map((record) => {
      const item = unmarshall(
        record.dynamodb!.NewImage! as Record<string, AttributeValue>
      );
      if (item.__edb_e__ === "Message") {
        const { data: message } = MessageEntity.parse({ Item: item });
        return message;
      }
      return null;
    })
    .filter((item): item is MessageEntityType => item !== null);

  // メッセージがなければ終了
  if (messages.length === 0) {
    return {
      batchItemFailures: [],
    };
  }

  // メッセージがあれば、現在WebSocketに接続している全員にメッセージを送信する（今回、ルームはないので）
  const { data: connections } = await ConnectionEntity.query
    .connections({})
    .go({ pages: "all" });
  const api = new ApiGatewayManagementApi({
    endpoint: `${process.env.WS_API_URL}/${process.env.STAGE}/`.replace(
      "wss://",
      "https://"
    ),
  });
  const postCalls = connections.map(async ({ connectionId }) => {
    try {
      await api.getConnection({
        ConnectionId: connectionId,
      });
    } catch (error) {
      const _error = error as Error;
      // 接続先が存在しないなら、接続情報を削除
      if (_error.name === "GoneException") {
        await ConnectionEntity.delete({ connectionId }).go();
        return null;
      }
      console.error(_error);
      return null;
    }
    return await api.postToConnection({
      ConnectionId: connectionId,
      Data: JSON.stringify(messages),
    });
  });
  const result = (await Promise.all(postCalls)).filter((r) => !!r);

  const response: DynamoDBBatchResponse = {
    batchItemFailures: result
      .filter((r) => r.$metadata.httpStatusCode !== 200)
      .map((r) => ({ itemIdentifier: r.$metadata.requestId! })),
  };
  return response;
};
