'use client';

import { useEffect } from 'react';
import { AppShell } from '@/components/shared/AppShell';
import { TabProvider } from '@/components/shared/TabContext';
import { TabPane } from '@/components/shared/TabPane';
import {
  CalendarScreen,
  FridgeProvider,
  FridgeScreen,
  ProfileScreen,
  RecipesScreen,
} from '@/components/fridge/FridgeApp';
import { registerServiceWorker } from '@/lib/sw-register';

export default function HomePage() {
  useEffect(() => {
    registerServiceWorker();
  }, []);

  return (
    <FridgeProvider>
      <TabProvider>
        <AppShell>
          <TabPane>
            <FridgeScreen />
          </TabPane>
          <TabPane>
            <CalendarScreen />
          </TabPane>
          <TabPane>
            <RecipesScreen />
          </TabPane>
          <TabPane>
            <ProfileScreen />
          </TabPane>
        </AppShell>
      </TabProvider>
    </FridgeProvider>
  );
}
