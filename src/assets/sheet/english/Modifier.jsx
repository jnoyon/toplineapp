import GrammarTopic from "../../components/GrammarTopic";
import modifierData from "../../students/data/modifier.json";

export default function Modifier() {
  return (
    <div className="mx-auto w-11/12 py-5">
      <GrammarTopic data={modifierData} />
    </div>
  );
}
