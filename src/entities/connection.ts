import { Dynamo } from "@/dynamo";
import { Entity, type EntityItem } from "electrodb";

/** 接続情報エンティティ */
export const ConnectionEntity = new Entity(
  {
    model: {
      version: "1",
      entity: "Connection",
      service: "rta-chat",
    },
    attributes: {
      /** 接続ID */
      connectionId: {
        type: "string",
        required: true,
        readOnly: true,
      },
    },
    indexes: {
      connections: {
        pk: {
          field: "pk",
          composite: [],
        },
        sk: {
          field: "sk",
          composite: ["connectionId"],
        },
      },
    },
  },
  Dynamo.Configuration
);

export type ConnectionEntityType = EntityItem<typeof ConnectionEntity>;
