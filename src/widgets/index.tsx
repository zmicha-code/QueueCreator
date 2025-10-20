import {
  Card,
  declareIndexPlugin,
  QueueInteractionScore,
  ReactRNPlugin,
  WidgetLocation,
  AppEvents,
} from '@remnote/plugin-sdk';

//import { getLastInterval, getWrongInRow } from './customQueueWidget';
import '../style.css';
import '../App.css';

async function onActivate(plugin: ReactRNPlugin) {
  //
  plugin.event.addListener(AppEvents.QueueLoadCard, undefined, 
    async function onQueueLoadCard(event: any) {
    
      if(event.cardId) {
        //currentCard = await plugin.card.findOne(event.cardId);

        // Provide Information For Widget
        await plugin.storage.setSynced("currentQueueCardId", event.cardId);
        //const lastInterval = getLastInterval(currentCard?.repetitionHistory)
        //if(lastInterval) {
        //  await plugin.storage.setSynced("currentQueueCardInterval", lastInterval.workingInterval);
        //  await plugin.storage.setSynced("currentQueueCardDate", lastInterval.intervalSetOn + lastInterval.workingInterval);
        //  await plugin.storage.setSynced("currentQueueCardRating", getLastRatingStr(currentCard?.repetitionHistory));
        //}
      }
    }
  );

  plugin.event.addListener(AppEvents.QueueCompleteCard, undefined,
    async function onQueueCompleteCard(event: any) {
      const cardId = event.cardId as string;
  
      // Fetch the card
      const card = await plugin.card.findOne(cardId);
  
      if (card && card.repetitionHistory && card.repetitionHistory.length > 0) {
        const lastScore = card.repetitionHistory[card.repetitionHistory.length - 1].score;
  
        if (
          lastScore === QueueInteractionScore.HARD ||
          lastScore === QueueInteractionScore.GOOD ||
          lastScore === QueueInteractionScore.EASY
        ) {
          // Get the current array from storage
          const currentQueueCardIds: string[] = (await plugin.storage.getSynced("currentQueueCardIds")) || [];
  
          // Remove the cardId from the array
          const updatedQueueCardIds = currentQueueCardIds.filter(id => id !== cardId);
  
          // Save the updated array back to storage
          await plugin.storage.setSynced("currentQueueCardIds", updatedQueueCardIds);
        }
      }
    }
  );  

  await plugin.app.registerWidget('customQueueWidget', WidgetLocation.RightSidebar, {
    dimensions: { height: 'auto', width: '100%' },
    widgetTabIcon: "https://i.imgur.com/nGwgOpN.png"
  });
}

async function onDeactivate(_: ReactRNPlugin) {}

declareIndexPlugin(onActivate, onDeactivate);