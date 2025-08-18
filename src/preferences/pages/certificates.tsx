import { createCustomPreferencePage } from "../helpers";
import { invoke } from "@tauri-apps/api/core";
import { useEffect, useRef, useState } from "react";
import { useStore } from "../../utilities/StoreContext";
import { Button, Typography } from "@mui/joy";

type Certificate = {
  name: string;
  certificate_id: string;
  serial_number: string;
  machine_name: string;
};

const CertificatesComponent = () => {
  let [certificates, setCertificates] = useState<Certificate[]>([]);
  let [loading, setLoading] = useState<boolean>(true);
  let [error, setError] = useState<string | null>(null);
  const [anisetteServer] = useStore<string>(
    "apple-id/anisette-server",
    "ani.sidestore.io"
  );
  const loadingRef = useRef<boolean>(false);
  useEffect(() => {
    let fetch = async () => {
      if (loadingRef.current) return;
      loadingRef.current = true;
      let certs = await invoke<Certificate[]>("get_certificates", {
        anisetteServer,
      });
      setCertificates(certs);
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
    return <div>Loading certificates...</div>;
  }
  if (error) {
    return <div className="error">{error}</div>;
  }

  return (
    <ul style={{ margin: 0, padding: 0, listStyleType: "none" }}>
      {certificates.map((cert) => (
        <li
          key={cert.certificate_id}
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--padding-md)",
          }}
        >
          <Button
            variant="soft"
            color="warning"
            onClick={async () => {
              try {
                await invoke("revoke_certificate", {
                  anisetteServer,
                  serialNumber: cert.serial_number,
                });
                setCertificates((prev) =>
                  prev.filter((c) => c.certificate_id !== cert.certificate_id)
                );
              } catch (e) {
                console.error("Failed to revoke certificate:", e);
                alert(
                  "Failed to revoke certificate: " +
                    e +
                    "\nPlease try again later."
                );
              }
            }}
          >
            Revoke
          </Button>
          <div>
            <div>
              {cert.name}: {cert.machine_name}
            </div>
            <Typography
              level="body-xs"
              sx={{ color: "var(--joy-palette-neutral-500)" }}
            >
              {cert.serial_number} ({cert.certificate_id})
            </Typography>
          </div>
        </li>
      ))}
      {certificates.length === 0 && <li>No certificates found.</li>}
    </ul>
  );
};

export const certificatesPage = createCustomPreferencePage(
  "certificates",
  "Certificates",
  CertificatesComponent,
  {
    description: "Manage your Apple ID certificates",
    category: "apple",
  }
);
