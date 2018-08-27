import React from "react";
import GameStripe from "renderer/pages/common/GameStripe";
import { messages } from "common/butlerd";
import { urlForCollection } from "common/util/navigation";
import styled from "renderer/styles";
import { Collection } from "common/butlerd/messages";
import TimeAgo from "renderer/basics/TimeAgo";
import { T } from "renderer/t";

const CollectionGameStripe = GameStripe(messages.FetchCollectionGames);

const CollectionInfo = styled.div`
  display: flex;
  flex-direction: row;
  align-items: center;

  font-size: ${props => props.theme.fontSizes.baseText};
  color: ${props => props.theme.ternaryText};
  font-weight: 700;
  margin: 0 0.5em;
`;

const CollectionInfoSpacer = styled.div`
  width: 0.4em;
`;

export default class CollectionPreview extends React.PureComponent<Props> {
  render() {
    const { profileId, coll } = this.props;
    return (
      <CollectionGameStripe
        title={coll.title}
        href={urlForCollection(coll.id)}
        params={{ profileId, collectionId: coll.id }}
        renderTitleExtras={this.renderTitleExtras}
        getGame={cg => cg.game}
      />
    );
  }

  renderTitleExtras = () => {
    const { coll } = this.props;
    return (
      <>
        <CollectionInfoSpacer />
        <CollectionInfo>
          {T(["collection.item_count", { itemCount: coll.gamesCount }])}
        </CollectionInfo>
        <CollectionInfo>
          {T(["collection.info.updated"])}
          <CollectionInfoSpacer />
          <TimeAgo date={coll.updatedAt} />
        </CollectionInfo>
      </>
    );
  };
}

interface Props {
  coll: Collection;
  profileId: number;
}