# 외부 확장 정의 폴더

`server/deploy/compose.yaml`의 통합 일꾼(`unified-consumer`, 프로필 `consumer`)이 이 폴더를 `/definitions`(읽기 전용)로 붙인다
([ADR-0140](../../../docs/decisions/0140-unified-consumer-runs-in-the-server-compose.md)). 여기 둔 C13 외부 확장 정의(`<id>.extension.json`)를
`.env`의 `BPM_CONSUMER__DEFINITIONS=/definitions/<파일>`(여럿이면 `:`로)로 고르면 일꾼이 뜰 때 Center에 올리고 그 일감을 맡는다.
그 앱의 주소·키는 `BPM_ADAPTER__EXT__<확장>__*`이다(`server/docs/setup.md`). 다른 폴더를 쓰려면 `BPM_CONSUMER__DEFINITIONS_HOST_DIR`.

콘솔 「연결 앱」(CON-18)에서 만든 HTTP 어댑터 앱은 여기 두지 않는다 — 일꾼이 Center에서 받는다([ADR-0141](../../../docs/decisions/0141-adapter-definitions-are-edited-in-the-console.md)).

일꾼 토큰의 토픽은 정의 id와 업무 처리기 토픽을 합친 것이어야 한다 — 콘솔 「일꾼」(CON-17)에서 맞춘다.
이 폴더는 저장소에 둔다 — 없으면 Docker가 root 소유로 만든다.
