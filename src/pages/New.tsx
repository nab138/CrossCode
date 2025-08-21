import logo from "../assets/logo.png";
import {
  AspectRatio,
  Button,
  Card,
  CardContent,
  CardOverflow,
  Link,
  Typography,
} from "@mui/joy";
import "./Onboarding.css";
import "./New.css";
import { templates } from "../utilities/templates";
import { useNavigate } from "react-router-dom";

export default () => {
  const navigate = useNavigate();
  return (
    <div className="onboarding">
      <div className="onboarding-header">
        <img src={logo} alt="CrossCode Logo" className="onboarding-logo" />
        <div>
          <Typography level="h1">Create New Project</Typography>
          <Typography level="body-sm">
            Select a template to get started
          </Typography>
        </div>
      </div>
      <div className="new-templates-container">
        {templates.map((template) => (
          <Card key={template.id} className="new-template-card">
            {template.image && (
              <CardOverflow>
                <AspectRatio ratio="2">
                  <img src={template.image} alt={template.name} />
                </AspectRatio>
              </CardOverflow>
            )}
            <CardContent>
              <Typography level="h3" className="new-template-title">
                <Link
                  overlay
                  underline="none"
                  href={`#`}
                  sx={{ color: "text.primary" }}
                  onClick={(e) => {
                    e.preventDefault();
                    navigate(`/new/${template.id}`);
                  }}
                >
                  {template.name}
                </Link>
              </Typography>
              <Typography level="body-sm" className="new-template-description">
                {template.description}
              </Typography>
            </CardContent>
          </Card>
        ))}
      </div>

      <Button
        sx={{ width: "fit-content" }}
        onClick={() => navigate("/")}
        variant="outlined"
      >
        Back to Home
      </Button>
    </div>
  );
};
