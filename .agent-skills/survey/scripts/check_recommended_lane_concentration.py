#!/usr/bin/env python3
import json,sys

def main():
    if len(sys.argv)!=3:
        sys.stderr.write('usage: check_recommended_lane_concentration.py <evidence.json> <output.json>\n')
        return 2
    ev=json.load(open(sys.argv[1],encoding='utf-8'))
    lanes=ev.get('lanes',{})
    cnt=0
    detail={}
    for k,v in lanes.items():
        kept=int(v.get('kept_count',0) or 0)
        detail[k]=kept
        if kept>0:
            cnt+=1
    status='pass' if cnt>=2 else 'degraded'
    out={
      'status':status,
      'recommended_lane_count':cnt,
      'single_lane_concentration':cnt<2,
      'lane_kept_counts':detail,
      'merge_blocked_reason':'' if status=='pass' else 'single-lane-concentration'
    }
    json.dump(out,open(sys.argv[2],'w',encoding='utf-8'),indent=2,ensure_ascii=False)
    print(status)
    return 0 if status=='pass' else 1
if __name__=='__main__':
    raise SystemExit(main())
