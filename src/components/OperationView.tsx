import {
  Accordion,
  AccordionDetails,
  AccordionSummary,
  Divider,
  Modal,
  ModalClose,
  ModalDialog,
  Typography,
} from "@mui/joy";
import { OperationState } from "../utilities/operations";
import "./OperationView.css";
import { SuccessIcon, ErrorIcon, StyledLoadingIcon } from "react-toast-plus";
import { PanoramaFishEye, DoNotDisturbOn } from "@mui/icons-material";

export default ({
  operationState,
  closeMenu,
}: {
  operationState: OperationState;
  closeMenu: () => void;
}) => {
  const operation = operationState.current;
  const opFailed = operationState.failed.length > 0;
  const done =
    (opFailed &&
      operationState.started.length ==
        operationState.completed.length + operationState.failed.length) ||
    operationState.completed.length == operation.steps.length;

  return (
    <Modal
      open={true}
      onClose={() => {
        if (done) closeMenu();
      }}
    >
      <ModalDialog sx={{ minWidth: "40rem", maxWidth: "90vw" }}>
        {done && <ModalClose />}
        <div>
          <Typography level="h3">{operation?.title}</Typography>
          <Typography level="body-lg">
            {done
              ? opFailed
                ? "Operation failed. Please see steps for details."
                : "Operation completed!"
              : "Please wait (this may take a while)..."}
          </Typography>
        </div>
        <Divider />
        <div className="operation-content">
          {operation.steps.map((step) => {
            let failed = operationState.failed.find((f) => f.stepId == step.id);
            let completed = operationState.completed.includes(step.id);
            let started = operationState.started.includes(step.id);
            let notStarted = !failed && !completed && !started;
            return (
              <div className="operation-step" key={step.id}>
                <div className="operation-step-icon">
                  {failed && <ErrorIcon />}
                  {!failed && completed && <SuccessIcon />}
                  {!failed && !completed && started && <StyledLoadingIcon />}
                  {notStarted && !opFailed && (
                    <PanoramaFishEye
                      sx={{
                        width: "100%",
                        height: "100%",
                        color: "neutral.500",

                        transform: "scale(1.2)",
                      }}
                    />
                  )}
                  {notStarted && opFailed && (
                    <DoNotDisturbOn
                      sx={{
                        width: "100%",
                        height: "100%",
                        color: "neutral.500",
                        transform: "scale(1.2)",
                      }}
                    />
                  )}
                </div>

                <div className="operation-step-internal">
                  <Typography
                    textColor={notStarted ? "neutral.500" : undefined}
                  >
                    {step.title}
                  </Typography>
                  {failed && (
                    <Accordion sx={{ marginTop: 0 }}>
                      <AccordionSummary>
                        <Typography level="body-sm">Details</Typography>
                      </AccordionSummary>
                      <AccordionDetails>
                        <pre className="operation-extra-details">
                          {failed.extraDetails}
                        </pre>
                      </AccordionDetails>
                    </Accordion>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </ModalDialog>
    </Modal>
  );
};
