import os
import datetime
from supabase import create_client, Client

# ==========================================================================
# 🔑 API CREDENTIALS LAYER: Insert your exact Supabase credentials below
# ==========================================================================
SUPABASE_URL = "https://tieaswmnzytdeuatkmmq.supabase.co"

# 🟢 REPLACE THIS: Paste your secret 'service_role' key token string here!
SUPABASE_KEY = "sb_secret_q10iY-_Fa-ZjbpdL4XX0BQ_WE9arRfS"

BUCKET_NAME = "tracking"

def run_workspace_pipeline():
    today = datetime.datetime.now()
    current_year = str(today.year)
    current_month_name = today.strftime("%B")  # e.g., "August"
    month_short = today.strftime("%b")         # e.g., "Aug"
    day_num = str(today.day)
    
    expected_prefix = f"{month_short}{day_num}".lower() # e.g., "aug16"
    
    print("==========================================================")
    print("📈 INTRADAY STAGING VALIDATOR & SUPABASE LINKAGE ENGINE")
    print("==========================================================")

    try:
        raw_files = [f for f in os.listdir('.') if os.path.isfile(f)]
    except Exception as e:
        print(f"❌ ACCESS ERROR: {str(e)}")
        return

    text_to_move = []
    media_to_upload = []

    for file in raw_files:
        if file.startswith('.') or file.endswith('.py') or 'stage_trade' in file:
            continue
            
        lower_name = file.lower()
        
        # Filter target suffixes matching your layout rules
        is_valid_type = any(ext in lower_name for ext in ['.txt', '.png', '.jpg', '.jpeg', '.mp4', '.mov'])
        if not is_valid_type:
            continue

        # Force verification checks case-insensitively matching target dates
        if not lower_name.startswith(expected_prefix):
            print(f"❌ VERIFICATION FAULT: '{file}' does not match today's date context.")
            corrected = input(f"👉 Rename file (Must start with '{month_short}{day_num}'): ").strip()
            if not corrected:
                print("🛑 Process aborted by manager.")
                return
            os.rename(file, corrected)
            file = corrected
            lower_name = file.lower()

        # Enforce exact structural classifications
        is_chart = '_chart.' in lower_name
        is_learning = '_learning.' in lower_name
        is_strategy = '_strategy.' in lower_name
        is_reels = '_reels.' in lower_name

        if not (is_chart or is_learning or is_strategy or is_reels):
            print(f"\n⚠️  CLASSIFICATION WARNING: '{file}' missing valid keyword identifier tag.")
            print("1 = Daily Chart Log File (_chart)")
            print("2 = Today's Concept Learning Vector (_learning)")
            print("3 = Systematic Playbook Actions (_strategy)")
            print("4 = Trading Reels Media Clip (_reels)")
            sel = input("👉 Choose classification tag (1-4): ").strip()
            
            base_part, ext_part = os.path.splitext(file)
            if sel == "1": file_new_name = f"{base_part}_chart{ext_part}"
            elif sel == "2": file_new_name = f"{base_part}_learning{ext_part}"
            elif sel == "3": file_new_name = f"{base_part}_strategy{ext_part}"
            elif sel == "4": file_new_name = f"{base_part}_reels{ext_part}"
            else:
                print("🛑 Aborted due to invalid input specification entry.")
                return
                
            os.rename(file, file_new_name)
            file = file_new_name
            lower_name = file.lower()

        # Standardize formatting to lowercase to eliminate case mismatches
        final_standard_name = file.lower()

        if final_standard_name.endswith('.txt'):
            text_to_move.append((file, final_standard_name))
        else:
            media_to_upload.append((file, final_standard_name))

    if not text_to_move and not media_to_upload:
        print(f"💡 No staging items found matching today's format arrays.")
        return

    # Move text files inside local directories hierarchy layout
    target_text_dir = os.path.join("data", current_year, current_month_name)
    if not os.path.exists(target_text_dir):
        os.makedirs(target_text_dir)

    for orig_txt, target_txt in text_to_move:
        dest_path = os.path.join(target_text_dir, target_txt)
        os.rename(orig_txt, dest_path)
        print(f"✅ Document Sync: Moved '{target_txt}' ➡️ '{target_text_dir}/'")

    # Stream charts and movies straight to Supabase
    if media_to_upload:
        try:
            supabase_client = create_client(SUPABASE_URL, SUPABASE_KEY)
            for orig_media, target_media in media_to_upload:
                cloud_path = f"{current_year}/{current_month_name}/{target_media}"
                print(f"🚀 Cloud Streaming: '{target_media}'...")
                
                m_type = "image/png" if target_media.endswith('.png') else "image/jpeg"
                if target_media.endswith(('.mp4', '.mov')): m_type = "video/mp4"

                with open(orig_media, 'rb') as buf:
                    supabase_client.storage.from_(BUCKET_NAME).upload(
                        path=cloud_path, file=buf,
                        file_options={"content-type": m_type, "x-upsert": "true"}
                    )
                print(f"🌟 Cloud Asset Live: tracking/{cloud_path}")
                os.remove(orig_media)
        except Exception as e:
            print(f"❌ STORAGE ERROR: {str(e)}")

    print("\n==========================================================")
    print("🏁 Sync finished successfully! Run git push to deploy updates.")
    print("==========================================================")

if __name__ == "__main__":
    run_workspace_pipeline()
