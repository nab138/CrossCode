import logo from "../assets/logo.png";
import { Input, Typography } from "@mui/joy";
import "./Onboarding.css";
import "./New.css";
import { templates } from "../utilities/templates";
import { Navigate, useNavigate, useParams } from "react-router-dom";
import { useState } from "react";
import { Button } from "@mui/joy";
import { invoke } from "@tauri-apps/api/core";
import { useToast } from "react-toast-plus";

export default () => {
  const navigate = useNavigate();
  const params = useParams<"template">();
  const templateId = params.template;
  if (!templateId) {
    return <Navigate to="/new" replace />;
  }
  const template = templates.find((t) => t.id === templateId);
  const { addToast } = useToast();
  if (!template) return <Navigate to="/new" replace />;

  const [form, setForm] = useState(
    Object.fromEntries(
      Object.entries(template.fields).map(([key]) => [key, ""])
    )
  );

  const handleChange = (key: string, value: string) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      let path = await invoke<string>("create_template", {
        template: templateId,
        name: form.projectName || template.name,
        parameters: form,
      });
      if (path) {
        navigate(`/ide/${encodeURIComponent(path)}`);
      }
    } catch (error) {
      addToast.error("Failed to create project: " + error);
    }
  };

  return (
    <div className="onboarding">
      <div className="onboarding-header">
        <img src={logo} alt="CrossCode Logo" className="onboarding-logo" />
        <div>
          <Typography level="h1">{template.name}</Typography>
          <Typography level="body-sm">{template.description}</Typography>
        </div>
      </div>
      <form onSubmit={handleSubmit} className="new-template-form">
        {Object.keys(template.fields).map((key) => {
          const field = template.fields[key];
          return (
            <div key={key} className="new-template-field">
              <Typography className="new-template-field-label">
                {field.label}
              </Typography>
              <Input
                required
                className="new-template-field-input"
                placeholder={field.default}
                value={form[key] ?? ""}
                onChange={(e) => handleChange(key, e.target.value)}
                name={key}
              />
            </div>
          );
        })}
        <Button type="submit" sx={{ mt: 2 }}>
          Create Project
        </Button>
        <Button onClick={() => navigate("/new")} variant="outlined">
          Back to Templates
        </Button>
      </form>
    </div>
  );
};
