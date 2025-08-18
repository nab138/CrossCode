import { createCustomPreferencePage } from "../helpers";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../../utilities/StoreContext";
import {
  Accordion,
  AccordionDetails,
  AccordionGroup,
  AccordionSummary,
  Button,
  Typography,
} from "@mui/joy";

type AppId = {
  app_id_id: string;
  identifier: string;
  name: string;
  features: Record<string, any>;
  expiration_date: Date | null;
};

type AppIdsResponse = {
  app_ids: AppId[];
  max_quantity: number;
  available_quantity: number;
};

const AppIdsComponent = () => {
  const [ids, setIds] = useState<AppId[]>([]);
  const [maxQuantity, setMaxQuantity] = useState<number | null>(null);
  const [availableQuantity, setAvailableQuantity] = useState<number | null>(
    null
  );
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [anisetteServer] = useStore<string>(
    "apple-id/anisette-server",
    "ani.sidestore.io"
  );
  const [canDelete] = useStore<boolean>("developer/delete-app-ids", false);
  const loadingRef = useRef<boolean>(false);

  useEffect(() => {
    let fetch = async () => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      let ids = await invoke<AppIdsResponse>("list_app_ids", {
        anisetteServer,
      });
      setIds(ids.app_ids);
      setMaxQuantity(ids.max_quantity);
      setAvailableQuantity(ids.available_quantity);
      setLoading(false);
      loadingRef.current = false;
    };
    fetch().catch((e) => {
      console.error("Failed to fetch certificates:", e);
      setError(
        "Failed to load certificates: " + e + "\nPlease try again later."
      );
      setLoading(false);
      loadingRef.current = false;
    });
  }, []);

  if (loading) {
    return <div>Loading App IDs...</div>;
  }
  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <div>
      {availableQuantity != null && maxQuantity != null && (
        <div style={{ marginBottom: "var(--padding-lg)" }}>
          You have {availableQuantity}/{maxQuantity} App IDs available.
        </div>
      )}
      <AccordionGroup
        sx={{ margin: 0, padding: 0, width: "calc(100% - var(--padding-xl))" }}
      >
        {ids.map((id) => (
          <Accordion key={id.app_id_id}>
            <AccordionSummary
              sx={{
                display: "flex",
                alignItems: "center",
                gap: "var(--padding-md)",
                padding: 0,
              }}
            >
              {canDelete && (
                <Button
                  variant="soft"
                  color="warning"
                  onClick={async () => {
                    try {
                      await invoke("delete_app_id", {
                        anisetteServer,
                        appIdId: id.app_id_id,
                      });
                      setIds((prev) =>
                        prev.filter((c) => c.app_id_id !== id.app_id_id)
                      );
                    } catch (e) {
                      console.error("Failed to delete app ID:", e);
                      alert(
                        "Failed to revoke app ID: " +
                          e +
                          "\nPlease try again later."
                      );
                    }
                  }}
                >
                  Delete
                </Button>
              )}
              <div>
                <div>
                  {id.name}: {id.app_id_id}
                </div>
                <Typography
                  level="body-xs"
                  sx={{ color: "var(--joy-palette-neutral-500)" }}
                >
                  {id.identifier}
                </Typography>
              </div>
              {id.expiration_date && (
                <div style={{ flexGrow: 1, textAlign: "right" }}>
                  <Typography level="body-sm">
                    Expires {new Date(id.expiration_date).toLocaleDateString()}
                  </Typography>
                </div>
              )}
            </AccordionSummary>
            <AccordionDetails>
              <Typography level="body-md">Features:</Typography>
              <ul style={{ margin: 0, paddingLeft: "var(--padding-xl)" }}>
                {Object.entries(id.features).map(([feature, value]) => (
                  <li key={feature}>
                    <strong>{feature}:</strong> {JSON.stringify(value)}
                  </li>
                ))}
              </ul>
            </AccordionDetails>
          </Accordion>
        ))}
        {ids.length === 0 && <li>No App IDs found.</li>}
      </AccordionGroup>
    </div>
  );
};

export const appIdsPage = createCustomPreferencePage(
  "appids",
  "App IDs",
  AppIdsComponent,
  {
    description:
      "Free developer accounts have a limit of 10 App IDs. You cannot delete App IDs, but they will expire after a week.",
    category: "apple",
  }
);
