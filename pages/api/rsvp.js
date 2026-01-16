import { kv } from '@vercel/kv';

const RSVP_KEY = 'frisbee-rsvp-data';
const MAIN_LIST_LIMIT = 30;

export default async function handler(req, res) {
  if (req.method === 'GET') {
    // Get current RSVP data
    try {
      const data = await kv.get(RSVP_KEY);
      return res.status(200).json(data || { mainList: [], waitlist: [] });
    } catch (error) {
      console.error('Failed to get RSVP data:', error);
      return res.status(500).json({ error: 'Failed to load data' });
    }
  }

  if (req.method === 'POST') {
    // Add new RSVP
    const { name, deviceId } = req.body;

    if (!name || !deviceId) {
      return res.status(400).json({ error: 'Name and deviceId are required' });
    }

    const trimmedName = name.trim();
    if (!trimmedName) {
      return res.status(400).json({ error: 'Name cannot be empty' });
    }

    try {
      const data = await kv.get(RSVP_KEY) || { mainList: [], waitlist: [] };
      const { mainList, waitlist } = data;

      // Check if device already signed up
      const allSignups = [...mainList, ...waitlist];
      if (allSignups.some(p => p.deviceId === deviceId)) {
        return res.status(400).json({ error: "You've already signed up from this device!" });
      }

      // Check if name already exists
      if (allSignups.some(p => p.name.toLowerCase() === trimmedName.toLowerCase())) {
        return res.status(400).json({ error: 'This name is already on the list!' });
      }

      const newPerson = {
        id: Date.now(),
        name: trimmedName,
        timestamp: new Date().toISOString(),
        deviceId: deviceId
      };

      let newMainList = mainList;
      let newWaitlist = waitlist;
      let message = '';
      let listType = '';

      if (mainList.length < MAIN_LIST_LIMIT) {
        newMainList = [...mainList, newPerson];
        message = `You're in! Spot #${newMainList.length}`;
        listType = 'main';
      } else {
        newWaitlist = [...waitlist, newPerson];
        message = `Main list full. You're #${newWaitlist.length} on the waitlist`;
        listType = 'waitlist';
      }

      await kv.set(RSVP_KEY, { mainList: newMainList, waitlist: newWaitlist });

      return res.status(200).json({
        success: true,
        message,
        listType,
        person: newPerson,
        mainList: newMainList,
        waitlist: newWaitlist
      });
    } catch (error) {
      console.error('Failed to add RSVP:', error);
      return res.status(500).json({ error: 'Failed to save RSVP' });
    }
  }

  if (req.method === 'DELETE') {
    // Remove RSVP
    const { personId, deviceId, isWaitlist } = req.body;

    if (!personId || !deviceId) {
      return res.status(400).json({ error: 'personId and deviceId are required' });
    }

    try {
      const data = await kv.get(RSVP_KEY) || { mainList: [], waitlist: [] };
      let { mainList, waitlist } = data;

      // Find the person
      const list = isWaitlist ? waitlist : mainList;
      const person = list.find(p => p.id === personId);

      if (!person) {
        return res.status(404).json({ error: 'Person not found' });
      }

      // Verify device ownership
      if (person.deviceId !== deviceId) {
        return res.status(403).json({ error: 'You can only remove your own signup' });
      }

      let message = '';
      let promotedPerson = null;

      if (isWaitlist) {
        waitlist = waitlist.filter(p => p.id !== personId);
        message = 'Removed from waitlist';
      } else {
        mainList = mainList.filter(p => p.id !== personId);

        // Promote from waitlist if available
        if (waitlist.length > 0) {
          promotedPerson = waitlist[0];
          mainList = [...mainList, promotedPerson];
          waitlist = waitlist.slice(1);
          message = `Spot opened! ${promotedPerson.name} promoted from waitlist`;
        } else {
          message = 'Removed from main list';
        }
      }

      await kv.set(RSVP_KEY, { mainList, waitlist });

      return res.status(200).json({
        success: true,
        message,
        promotedPerson,
        mainList,
        waitlist
      });
    } catch (error) {
      console.error('Failed to remove RSVP:', error);
      return res.status(500).json({ error: 'Failed to remove RSVP' });
    }
  }

  if (req.method === 'PUT') {
    // Reset all RSVPs (admin)
    const { action } = req.body;

    if (action === 'reset') {
      try {
        await kv.set(RSVP_KEY, { mainList: [], waitlist: [] });
        return res.status(200).json({
          success: true,
          message: 'All RSVPs cleared',
          mainList: [],
          waitlist: []
        });
      } catch (error) {
        console.error('Failed to reset RSVPs:', error);
        return res.status(500).json({ error: 'Failed to reset RSVPs' });
      }
    }

    return res.status(400).json({ error: 'Invalid action' });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
